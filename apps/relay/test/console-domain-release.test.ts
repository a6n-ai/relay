import { env, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireActor } from "../src/console/actor";
import { addDomain, checkDomain, releaseDomain } from "../src/services/domains";
import { releaseStalePendingDomains } from "../src/services/domain-state";
import { memorySesIdentity } from "../src/core/ses-identity";
import { coreDb } from "../src/db/core/client";
import { sendingDomain } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { securityAudit } from "../src/db/security/schema";
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

async function workspaceFor(email: string, name: string, role: "user" | "admin" = "admin") {
  const cookie = await cookieFor(email, role);
  const workspaceId = await createWorkspace(cookie, name);
  await setActive(cookie, workspaceId);
  return { cookie, workspaceId };
}

async function adminActorFor(email: string, name: string) {
  const { cookie, workspaceId } = await workspaceFor(email, name);
  return { workspaceId, actor: await requireActor(env, headersFor(cookie), WRITE) };
}

// Backdates a row so the sweeper sees it as old; createdAt is set directly because the real clock cannot move.
async function ageDomain(id: string, days: number, status?: "verified") {
  await coreDb(env)
    .update(sendingDomain)
    .set({ createdAt: new Date(Date.now() - days * DAY), ...(status ? { status } : {}) })
    .where(eq(sendingDomain.id, id));
}

async function domainRow(id: string) {
  const [row] = await coreDb(env).select().from(sendingDomain).where(eq(sendingDomain.id, id));
  return row;
}

describe("pending sending domain release", { timeout: 60_000 }, () => {
  it("releases a 15-day pending domain, keeps a 13-day one, and keeps a verified one of any age", async () => {
    const { actor } = await adminActorFor("rel-sweep@example.com", "Rel Sweep Co");
    const old = await addDomain(env, actor, { domain: "rel-old.test" });
    const young = await addDomain(env, actor, { domain: "rel-young.test" });
    const verified = await addDomain(env, actor, { domain: "rel-verified.test" });
    await ageDomain(old.id, 15);
    await ageDomain(young.id, 13);
    await ageDomain(verified.id, 400, "verified");

    expect(await domainRow(old.id)).toMatchObject({ createdByRelay: true, verifiedAt: null });
    expect(await releaseStalePendingDomains(env)).toBe(1);
    expect(await domainRow(old.id)).toBeUndefined();
    expect(await memorySesIdentity.get("ap-south-1", "rel-old.test")).toBeNull();
    expect(await memorySesIdentity.get("ap-south-1", "rel-young.test")).not.toBeNull();
    expect(await domainRow(young.id)).toMatchObject({ status: "pending" });
    expect(await domainRow(verified.id)).toMatchObject({ status: "verified" });

    const audits = await securityDb(env)
      .select({ target: securityAudit.target, workspaceId: securityAudit.workspaceId, data: securityAudit.data })
      .from(securityAudit)
      .where(and(eq(securityAudit.action, "domain.release"), eq(securityAudit.target, old.id)));
    expect(audits).toHaveLength(1);
    expect(audits[0].data).toBeNull();
  });

  it("still releases a pending domain when the SES identity delete fails", async () => {
    const { actor } = await adminActorFor("rel-ses@example.com", "Rel SES Co");
    const { id } = await addDomain(env, actor, { domain: "rel-ses.test" });
    await ageDomain(id, 20);
    vi.spyOn(memorySesIdentity, "delete").mockRejectedValueOnce(new Error("ses down"));

    expect(await releaseStalePendingDomains(env)).toBe(1);
    expect(await domainRow(id)).toBeUndefined();
  });

  it("lets a super admin release a pending domain now, and refuses a workspace owner and a verified domain", async () => {
    const host = await adminActorFor("rel-host@example.com", "Rel Host Co");
    const { id } = await addDomain(env, host.actor, { domain: "rel-admin.test" });
    const ownerCookie = await addMember(host.workspaceId, "rel-owner@example.com", "owner");
    const owner = await requireActor(env, headersFor(ownerCookie), WRITE);

    await expect(releaseDomain(env, owner, id)).rejects.toMatchObject({ status: 403 });
    expect(await domainRow(id)).toMatchObject({ status: "pending" });

    await releaseDomain(env, host.actor, id);
    expect(await domainRow(id)).toBeUndefined();

    const verified = await addDomain(env, host.actor, { domain: "rel-admin-verified.test" });
    await coreDb(env).update(sendingDomain).set({ status: "verified" }).where(eq(sendingDomain.id, verified.id));
    await expect(releaseDomain(env, host.actor, verified.id)).rejects.toMatchObject({ status: 409 });
    expect(await domainRow(verified.id)).toMatchObject({ status: "verified" });
  });

  it("never releases or deletes a seeded row, even pending for a year", async () => {
    const { workspaceId } = await adminActorFor("rel-seed@example.com", "Rel Seed Co");
    memorySesIdentity.preset("ap-south-1", "rel-seeded.test", { verified: false, dkimStatus: "PENDING", dkimTokens: ["t"] });
    const [{ id }] = await coreDb(env)
      .insert(sendingDomain)
      .values({ workspaceId, domain: "rel-seeded.test", sesRegion: "ap-south-1", createdAt: new Date(Date.now() - 365 * DAY) })
      .returning({ id: sendingDomain.id });
    expect(await domainRow(id)).toMatchObject({ createdByRelay: false, status: "pending" });

    expect(await releaseStalePendingDomains(env)).toBe(0);
    expect(await domainRow(id)).toMatchObject({ status: "pending" });
    expect(await memorySesIdentity.get("ap-south-1", "rel-seeded.test")).not.toBeNull();
  });

  it("never releases an adopted identity, even a super admin by hand", async () => {
    const host = await adminActorFor("rel-adopt@example.com", "Rel Adopt Co");
    memorySesIdentity.preset("ap-south-1", "rel-adopted.test", { verified: false, dkimStatus: "PENDING", dkimTokens: ["t"] });
    const { id } = await addDomain(env, host.actor, { domain: "rel-adopted.test" });
    expect(await domainRow(id)).toMatchObject({ createdByRelay: false, status: "pending" });
    await ageDomain(id, 30);

    expect(await releaseStalePendingDomains(env)).toBe(0);
    await expect(releaseDomain(env, host.actor, id)).rejects.toMatchObject({ status: 409 });
    expect(await domainRow(id)).toBeDefined();
    expect(await memorySesIdentity.get("ap-south-1", "rel-adopted.test")).not.toBeNull();
  });

  it("never releases a domain that was verified once and flapped back to pending", async () => {
    const host = await adminActorFor("rel-flap@example.com", "Rel Flap Co");
    const { id } = await addDomain(env, host.actor, { domain: "rel-flap.test" });
    memorySesIdentity.preset("ap-south-1", "rel-flap.test", { verified: true, dkimStatus: "SUCCESS", dkimTokens: ["t"] });
    await checkDomain(env, host.actor, id);
    expect(await domainRow(id)).toMatchObject({ status: "verified", createdByRelay: true });
    expect((await domainRow(id))!.verifiedAt).toBeInstanceOf(Date);

    memorySesIdentity.preset("ap-south-1", "rel-flap.test", { verified: false, dkimStatus: "TEMPORARY_FAILURE", dkimTokens: ["t"] });
    await checkDomain(env, host.actor, id);
    expect(await domainRow(id)).toMatchObject({ status: "pending" });
    await ageDomain(id, 30);

    expect(await releaseStalePendingDomains(env)).toBe(0);
    await expect(releaseDomain(env, host.actor, id)).rejects.toMatchObject({ status: 409 });
    expect(await domainRow(id)).toBeDefined();
    expect(await memorySesIdentity.get("ap-south-1", "rel-flap.test")).not.toBeNull();
  });

  it("skips a Relay-created pending row whose SES identity now reports verified", async () => {
    const host = await adminActorFor("rel-late@example.com", "Rel Late Co");
    const { id } = await addDomain(env, host.actor, { domain: "rel-late.test" });
    memorySesIdentity.preset("ap-south-1", "rel-late.test", { verified: true, dkimStatus: "SUCCESS", dkimTokens: ["t"] });
    await ageDomain(id, 30);

    expect(await releaseStalePendingDomains(env)).toBe(0);
    expect(await domainRow(id)).toBeDefined();
    expect(await memorySesIdentity.get("ap-south-1", "rel-late.test")).not.toBeNull();
  });

  it("keeps sweeping when one release throws", async () => {
    const host = await adminActorFor("rel-throw@example.com", "Rel Throw Co");
    const a = await addDomain(env, host.actor, { domain: "rel-throw-a.test" });
    const b = await addDomain(env, host.actor, { domain: "rel-throw-b.test" });
    await ageDomain(a.id, 20);
    await ageDomain(b.id, 20);
    const get = memorySesIdentity.get.bind(memorySesIdentity);
    vi.spyOn(memorySesIdentity, "get").mockImplementation(async (region, domain) => {
      if (domain === "rel-throw-a.test") throw new Error("boom");
      return get(region, domain);
    });

    expect(await releaseStalePendingDomains(env)).toBe(1);
    expect(await domainRow(a.id)).toBeDefined();
    expect(await domainRow(b.id)).toBeUndefined();
  });
});
