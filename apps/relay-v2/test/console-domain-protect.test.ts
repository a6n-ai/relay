import { env, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireActor } from "../src/console/actor";
import { addDomain, releaseDomain, releaseStalePendingDomains, setDomainProtected } from "../src/console/domains";
import { memorySesIdentity } from "../src/core/ses-identity";
import { coreDb } from "../src/db/core/client";
import { sendingDomain } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { securityAudit } from "../src/db/security/schema";
import { allows, canDeleteProtectedDomain, roles } from "../src/lib/auth/permissions";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

const WRITE = { permission: { sending: ["write"] }, write: true };
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

async function adminActorFor(email: string, name: string) {
  const cookie = await cookieFor(email, "admin");
  const workspaceId = await createWorkspace(cookie, name);
  await setActive(cookie, workspaceId);
  return { workspaceId, actor: await requireActor(env, headersFor(cookie), WRITE) };
}

async function ageDomain(id: string, days: number) {
  await coreDb(env).update(sendingDomain).set({ createdAt: new Date(Date.now() - days * DAY) }).where(eq(sendingDomain.id, id));
}

async function domainRow(id: string) {
  const [row] = await coreDb(env).select().from(sendingDomain).where(eq(sendingDomain.id, id));
  return row;
}

describe("protected sending domains", { timeout: 60_000 }, () => {
  it("refuses release by the owner path and skips the sweep for a protected pending domain", async () => {
    const { actor } = await adminActorFor("prot-rel@example.com", "Prot Rel Co");
    const { id } = await addDomain(env, actor, { domain: "prot-rel.test" });
    await ageDomain(id, 20);
    await setDomainProtected(env, actor, id, true);

    await expect(releaseDomain(env, actor, id)).rejects.toMatchObject({ status: 409, message: "domain is protected" });
    expect(await releaseStalePendingDomains(env)).toBe(0);
    expect(await domainRow(id)).toMatchObject({ protected: true, status: "pending" });
    expect(await memorySesIdentity.get("ap-south-1", "prot-rel.test")).not.toBeNull();
  });

  it("lets a super admin toggle protection, refuses a workspace owner, and audits by id", async () => {
    const host = await adminActorFor("prot-tog@example.com", "Prot Tog Co");
    const { id } = await addDomain(env, host.actor, { domain: "prot-tog.test" });
    const ownerCookie = await addMember(host.workspaceId, "prot-owner@example.com", "owner");
    const owner = await requireActor(env, headersFor(ownerCookie), WRITE);

    await expect(setDomainProtected(env, owner, id, true)).rejects.toMatchObject({ status: 403 });
    expect(await domainRow(id)).toMatchObject({ protected: false });

    await setDomainProtected(env, host.actor, id, true);
    expect(await domainRow(id)).toMatchObject({ protected: true });
    await setDomainProtected(env, host.actor, id, false);
    expect(await domainRow(id)).toMatchObject({ protected: false });

    const audits = await securityDb(env)
      .select({ action: securityAudit.action, target: securityAudit.target, data: securityAudit.data })
      .from(securityAudit)
      .where(and(eq(securityAudit.target, id), eq(securityAudit.action, "domain.protect")));
    expect(audits).toHaveLength(1);
    expect(audits[0].data).toBeNull();
  });

  it("grants domain:delete_protected to the super admin role only", async () => {
    expect(canDeleteProtectedDomain(true)).toBe(true);
    expect(canDeleteProtectedDomain(false)).toBe(false);
    expect(roles.user.authorize({ domain: ["delete_protected"] }).success).toBe(false);
    expect(allows(["owner", "admin", "member", "billing"], { domain: ["delete_protected"] })).toBe(false);
  });

  it("inserts adopted shared domains protected and a custom domain not, with no console toggle needed", async () => {
    const { actor } = await adminActorFor("prot-adopt@example.com", "Prot Adopt Co");
    memorySesIdentity.preset("ap-south-1", "tiffingrab.ca", { verified: true, dkimStatus: "SUCCESS", dkimTokens: ["t"] });
    const tiffin = await addDomain(env, actor, { domain: "TiffinGrab.ca" });
    const custom = await addDomain(env, actor, { domain: "prot-custom.test" });
    expect(await domainRow(tiffin.id)).toMatchObject({ protected: true, createdByRelay: false });
    expect(await domainRow(custom.id)).toMatchObject({ protected: false });
  });
});
