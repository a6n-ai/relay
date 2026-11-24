import { env, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireActor, requirePlatformAdmin } from "../src/console/actor";
import { listWorkspaces, setAudienceBindingFor, setWorkspaceInviteCap, setWorkspaceQuota, setWorkspaceStatus } from "../src/console/admin";
import { addApp, createKey } from "../src/console/apps";
import { addAddress, addDomain, checkDomain } from "../src/console/domains";
import { inviteMember } from "../src/console/members";
import { memorySesIdentity } from "../src/core/ses-identity";
import { securityDb } from "../src/db/security/client";
import { invitation, securityAudit, user, workspace } from "../src/db/security/schema";
import { addMember, cookieFor, createWorkspace, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

const headersFor = (cookie: string) => new Headers({ cookie });
const WRITE = { permission: { sending: ["write"] }, write: true };
const OPS = { userId: "usr_ops_test" };

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

async function workspaceFor(email: string, name: string) {
  const cookie = await cookieFor(email, "admin");
  const workspaceId = await createWorkspace(cookie, name);
  await setActive(cookie, workspaceId);
  return { cookie, workspaceId };
}

// A workspace with a verified sender and an API key, ready to send over /api/v1/messages.
async function sendingWorkspace(email: string, name: string, domain: string) {
  const a = await workspaceFor(email, name);
  const actor = await requireActor(env, headersFor(a.cookie), WRITE);
  const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
  const { id: domainId } = await addDomain(env, actor, { domain });
  memorySesIdentity.preset("ap-south-1", domain, { verified: true, dkimStatus: "SUCCESS", dkimTokens: [] });
  await checkDomain(env, actor, domainId);
  const from = `hi@${domain}`;
  await addAddress(env, actor, { appId, email: from, kind: "sender", canSend: true });
  const key = await createKey(env, actor, { appId, name: "test" });
  return { ...a, from, secret: key.secret };
}

const sendRequest = (secret: string, from: string) =>
  SELF.fetch(`${ORIGIN}/api/v1/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ stream: "transactional", from, to: "guest@x.com", subject: "Hi", html: "<p>hi</p>", text: "hi" }),
  });

describe("console platform admin", { timeout: 60_000 }, () => {
  it("lists each workspace with its status, quota, sends this month and member count", async () => {
    const a = await workspaceFor("adm-list@example.com", "adm-list-co");

    const rows = await listWorkspaces(env, OPS);
    expect(rows).toContainEqual(
      expect.objectContaining({ id: a.workspaceId, slug: "adm-list-co", status: "active", quota: 10000, members: 1, sentThisMonth: 0 }),
    );
  });

  it("lists when a suspended workspace was suspended and when its inbound mail stops, and nulls for an active one", async () => {
    const active = await workspaceFor("adm-susp-list@example.com", "adm-susp-list-co");
    const suspended = await workspaceFor("adm-susp-at@example.com", "adm-susp-at-co");
    await setWorkspaceStatus(env, OPS, suspended.workspaceId, "suspended");

    const rows = await listWorkspaces(env, OPS);
    const activeRow = rows.find((r) => r.id === active.workspaceId);
    const suspendedRow = rows.find((r) => r.id === suspended.workspaceId);
    expect(activeRow).toMatchObject({ suspendedAt: null, inboundUntil: null });
    expect(suspendedRow?.suspendedAt).toBeTypeOf("number");
    expect(suspendedRow?.inboundUntil).toBe((suspendedRow?.suspendedAt ?? 0) + 7 * 24 * 60 * 60 * 1000);
  });

  it("keeps the first suspended_at when a suspended workspace is suspended again", async () => {
    const a = await workspaceFor("adm-resusp@example.com", "adm-resusp-co");
    await setWorkspaceStatus(env, OPS, a.workspaceId, "suspended");
    const first = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await securityDb(env).update(workspace).set({ suspendedAt: first }).where(eq(workspace.id, a.workspaceId));
    await setWorkspaceStatus(env, OPS, a.workspaceId, "suspended");
    const [row] = await securityDb(env).select({ at: workspace.suspendedAt }).from(workspace).where(eq(workspace.id, a.workspaceId));
    expect(row?.at?.getTime()).toBe(first.getTime());
    await setWorkspaceStatus(env, OPS, a.workspaceId, "active");
    const [after] = await securityDb(env).select({ at: workspace.suspendedAt }).from(workspace).where(eq(workspace.id, a.workspaceId));
    expect(after?.at).toBeNull();
  });

  it("answers 404 to a workspace member who is not a platform admin", async () => {
    const host = await workspaceFor("adm-host@example.com", "adm-host-co");
    const plain = await addMember(host.workspaceId, "adm-plain@example.com", "owner");

    const res = await SELF.fetch(`${ORIGIN}/admin`, { headers: { cookie: plain } });
    expect(res.status).toBe(404);
    await expect(requirePlatformAdmin(env, headersFor(plain))).rejects.toMatchObject({ status: 404 });
  });

  it("suspending writes the audit row and the workspace's key returns 401; resuming restores it", async () => {
    const a = await sendingWorkspace("adm-susp@example.com", "adm-susp-co", "adm-susp.test");
    vi.spyOn(env.SEND, "send").mockResolvedValue(undefined as never);

    await setWorkspaceStatus(env, OPS, a.workspaceId, "suspended");
    const [audit] = await securityDb(env)
      .select({ action: securityAudit.action })
      .from(securityAudit)
      .where(and(eq(securityAudit.action, "workspace.suspend"), eq(securityAudit.workspaceId, a.workspaceId)));
    expect(audit).toEqual({ action: "workspace.suspend" });
    expect((await sendRequest(a.secret, a.from)).status).toBe(401);

    await setWorkspaceStatus(env, OPS, a.workspaceId, "active");
    expect((await sendRequest(a.secret, a.from)).status).toBe(202);
  });

  it("a quota of 1 refuses the second send at once, because the limits snapshot is refreshed", async () => {
    const a = await sendingWorkspace("adm-quota@example.com", "adm-quota-co", "adm-quota.test");
    vi.spyOn(env.SEND, "send").mockResolvedValue(undefined as never);

    await setWorkspaceQuota(env, OPS, a.workspaceId, 1);
    expect((await sendRequest(a.secret, a.from)).status).toBe(202);
    const second = await sendRequest(a.secret, a.from);
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ error: "quota_exceeded" });
  });

  it("refuses a quota that is not a non-negative integer", async () => {
    const a = await workspaceFor("adm-bad-quota@example.com", "adm-bad-quota-co");
    await expect(setWorkspaceQuota(env, OPS, a.workspaceId, -1)).rejects.toMatchObject({ status: 400 });
    await expect(setWorkspaceQuota(env, OPS, a.workspaceId, 1.5)).rejects.toMatchObject({ status: 400 });
  });

  it("renders the admin page for a platform admin, listing the workspace slug", async () => {
    const a = await workspaceFor("adm-page@example.com", "adm-page-co");

    const res = await SELF.fetch(`${ORIGIN}/admin`, { headers: { cookie: a.cookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("adm-page-co");
  });

  it("opens the admin page for a platform admin with no workspace membership, and still redirects a plain user", async () => {
    await workspaceFor("adm-bare-host@example.com", "adm-bare-co");
    const bare = await cookieFor("adm-bare@example.com", "admin");

    const page = await SELF.fetch(`${ORIGIN}/admin`, { redirect: "manual", headers: { cookie: bare } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("adm-bare-co");

    const plain = await cookieFor("adm-bare-user@example.com", "user");
    const res = await SELF.fetch(`${ORIGIN}/admin`, { redirect: "manual", headers: { cookie: plain } });
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toBe("/no-workspace");
  });
});

describe("console platform admin invite cap", { timeout: 60_000 }, () => {
  const INVITE = { permission: { invitation: ["create"] }, write: true };

  async function seedInvites(workspaceId: string, inviterId: string, count: number) {
    for (let i = 0; i < count; i++) {
      await securityDb(env).insert(invitation).values({
        organizationId: workspaceId,
        email: `seed-cap-${workspaceId}-${i}@x.test`,
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 2 * 86_400_000),
        inviterId,
      });
    }
  }

  it("lets a platform admin raise one workspace's daily invite cap and writes the audit row", async () => {
    const a = await workspaceFor("adm-invite-cap@example.com", "adm-invite-cap-co");
    const [owner] = await securityDb(env).select({ id: user.id }).from(user).where(eq(user.email, "adm-invite-cap@example.com"));
    await seedInvites(a.workspaceId, owner.id, 20);
    const actor = await requireActor(env, headersFor(a.cookie), INVITE);

    await expect(
      inviteMember(env, actor, headersFor(a.cookie), { email: "cap-default@x.test", role: "member" }),
    ).rejects.toMatchObject({ status: 429, message: "invite limit reached" });

    await setWorkspaceInviteCap(env, OPS, a.workspaceId, 25);
    expect((await listWorkspaces(env, OPS)).find((r) => r.id === a.workspaceId)?.invitesPerDay).toBe(25);
    await expect(
      inviteMember(env, actor, headersFor(a.cookie), { email: "cap-raised@x.test", role: "member" }),
    ).resolves.toEqual({ id: expect.any(String) });

    const [audit] = await securityDb(env)
      .select({ action: securityAudit.action, target: securityAudit.target })
      .from(securityAudit)
      .where(and(eq(securityAudit.action, "workspace.invite_cap"), eq(securityAudit.workspaceId, a.workspaceId)));
    expect(audit).toEqual({ action: "workspace.invite_cap", target: a.workspaceId });
  });

  it("refuses a cap outside 1 to 10000 with a fixed 400", async () => {
    const a = await workspaceFor("adm-bad-invite-cap@example.com", "adm-bad-invite-cap-co");
    for (const cap of [0, 10_001, 1.5]) {
      await expect(setWorkspaceInviteCap(env, OPS, a.workspaceId, cap)).rejects.toMatchObject({ status: 400, message: "invalid input" });
    }
  });
});

describe("audience binding (super admin)", () => {
  it("refuses an unknown binding, and an app outside the workspace", async () => {
    const a = await workspaceFor("bind-a@example.com", "Bind A Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    const admin = { userId: actor.userId };
    await expect(setAudienceBindingFor(env, admin, a.workspaceId, appId, "MAIL")).rejects.toThrow("unknown binding");
    await expect(setAudienceBindingFor(env, admin, "ws_not_mine", appId, "TIFFIN_AUDIENCE")).rejects.toMatchObject({ status: 404 });
    expect(await setAudienceBindingFor(env, admin, a.workspaceId, appId, "TIFFIN_AUDIENCE")).toEqual({ secret: null });
  });
});
