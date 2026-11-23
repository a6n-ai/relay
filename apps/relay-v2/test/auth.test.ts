import { env, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { coreDb } from "../src/db/core/client";
import { address, workspaceProfile } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { app, member, securityAudit, user, verification, workspace } from "../src/db/security/schema";
import { createAuth, pickMailer } from "../src/lib/auth";
import { consoleInviteMailer, memoryInviteMailer, pickInviteMailer } from "../src/lib/auth/invite-mailer";
import { memoryOtpMailer } from "../src/lib/auth/otp-mailer";
import { newId } from "../src/lib/ids";
import type { Env } from "../src/env";
import { applyMigrations } from "./migrate";

const ORIGIN = "http://localhost";
const BASE = `${ORIGIN}/api/auth`;
const json = { "content-type": "application/json" };
const db = securityDb(env);

beforeAll(async () => {
  await applyMigrations();
});

async function insertUser(email: string, role: "user" | "admin"): Promise<void> {
  await db.insert(user).values({ id: newId("usr"), name: email, email, role });
}

// Each helper call gets its own client IP, so the per-IP OTP limit never trips across tests.
let ipSeq = 0;
function freshIp(): Record<string, string> {
  ipSeq += 1;
  return { "cf-connecting-ip": `10.0.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}` };
}
async function sendOtp(email: string): Promise<string> {
  const sent = await SELF.fetch(`${BASE}/email-otp/send-verification-otp`, {
    method: "POST",
    headers: { ...json, ...freshIp() },
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  expect(sent.status).toBe(200);
  const otp = memoryOtpMailer.lastOtp(email);
  expect(otp).toMatch(/^\d{6}$/);
  return otp as string;
}

async function signIn(email: string): Promise<string> {
  const otp = await sendOtp(email);
  const res = await SELF.fetch(`${BASE}/sign-in/email-otp`, {
    method: "POST",
    headers: { ...json, ...freshIp() },
    body: JSON.stringify({ email, otp }),
  });
  expect(res.status).toBe(200);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("better-auth on D1", () => {
  it("signs in with an email OTP and returns a session cookie", async () => {
    await insertUser("owner@example.com", "admin");
    const cookie = await signIn("owner@example.com");
    expect(cookie).toMatch(/better-auth\.session_token=/);
  });

  it("stores the email OTP hashed, never as the plain code", async () => {
    const email = "hash@example.com";
    await insertUser(email, "user");
    const otp = await sendOtp(email);
    const rows = (await db.select().from(verification)).filter((r) => r.identifier === `sign-in-otp-${email}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).not.toContain(otp);
  });

  it("creates a workspace with a wsp_ id, default quota, and an owner member", async () => {
    await insertUser("creator@example.com", "admin");
    const cookie = await signIn("creator@example.com");
    const res = await SELF.fetch(`${BASE}/organization/create`, {
      method: "POST",
      headers: { ...json, cookie, origin: ORIGIN },
      body: JSON.stringify({ name: "Acme", slug: "acme" }),
    });
    expect(res.status).toBe(200);
    const org = (await res.json()) as { id: string };
    expect(org.id).toMatch(/^wsp_/);

    const [profile] = await coreDb(env).select().from(workspaceProfile).where(eq(workspaceProfile.workspaceId, org.id));
    expect(profile.monthlyMessageQuota).toBe(10000);

    const [m] = await db.select().from(member).where(eq(member.organizationId, org.id));
    expect(m.role).toBe("owner");
  });

  it("rejects organization/create from a signed-in non-admin and writes no workspace", async () => {
    await insertUser("plain@example.com", "user");
    const cookie = await signIn("plain@example.com");
    const res = await SELF.fetch(`${BASE}/organization/create`, {
      method: "POST",
      headers: { ...json, cookie, origin: ORIGIN },
      body: JSON.stringify({ name: "Blocked", slug: "blocked" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const rows = await db.select().from(workspace).where(eq(workspace.slug, "blocked"));
    expect(rows).toHaveLength(0);
  });

  it("rejects organization/create without a session with 401", async () => {
    const res = await SELF.fetch(`${BASE}/organization/create`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ name: "Nope", slug: "nope" }),
    });
    expect(res.status).toBe(401);
  });

  it("does not create a user when OTP sign-in targets an unknown email", async () => {
    const email = "ghost@example.com";
    const sent = await SELF.fetch(`${BASE}/email-otp/send-verification-otp`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email, type: "sign-in" }),
    });
    expect(sent.status).toBe(200);
    expect(memoryOtpMailer.lastOtp(email)).toBeUndefined();

    const res = await SELF.fetch(`${BASE}/sign-in/email-otp`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email, otp: "000000" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const rows = await db.select().from(user).where(eq(user.email, email));
    expect(rows).toHaveLength(0);
  });

  it("fails closed when the OTP mailer is unset or unknown", () => {
    expect(() => pickMailer(undefined)).toThrow("no OTP mailer configured");
    expect(() => pickMailer("smtp" as Env["OTP_MAILER"])).toThrow("no OTP mailer configured");
    expect(pickMailer("memory")).toBe(memoryOtpMailer);
  });

  it("throws when BETTER_AUTH_SECRET is missing", () => {
    expect(() => createAuth({ ...env, BETTER_AUTH_SECRET: "" } as Env)).toThrow(
      "BETTER_AUTH_SECRET and BETTER_AUTH_URL are required",
    );
  });
});

async function cookieFor(email: string, role: "user" | "admin"): Promise<string> {
  await insertUser(email, role);
  return signIn(email);
}

async function createWorkspace(cookie: string, slug: string): Promise<string> {
  const res = await SELF.fetch(`${BASE}/organization/create`, {
    method: "POST",
    headers: { ...json, cookie, origin: ORIGIN },
    body: JSON.stringify({ name: slug, slug }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

describe("admin and organization plugins", () => {
  it("lets an admin create a workspace, invite B, and makes B a member on accept", async () => {
    const adminCookie = await cookieFor("admin-invite@example.com", "admin");
    const orgId = await createWorkspace(adminCookie, "invite-co");

    const invite = await SELF.fetch(`${BASE}/organization/invite-member`, {
      method: "POST",
      headers: { ...json, cookie: adminCookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: orgId, email: "b@example.com", role: "member" }),
    });
    expect(invite.status).toBe(200);
    const sent = memoryInviteMailer.lastInvite("b@example.com");
    expect(sent?.id).toMatch(/^inv_/);

    await insertUser("b@example.com", "user");
    const bCookie = await signIn("b@example.com");
    const accept = await SELF.fetch(`${BASE}/organization/accept-invitation`, {
      method: "POST",
      headers: { ...json, cookie: bCookie, origin: ORIGIN },
      body: JSON.stringify({ invitationId: sent?.id }),
    });
    expect(accept.status).toBe(200);

    const [bUser] = await db.select().from(user).where(eq(user.email, "b@example.com"));
    const [bMember] = await db
      .select()
      .from(member)
      .where(eq(member.userId, bUser.id));
    expect(bMember.organizationId).toBe(orgId);
    expect(bMember.role).toBe("member");
  });

  it("refuses invite and delete from a member", async () => {
    const adminCookie = await cookieFor("admin-roles@example.com", "admin");
    const orgId = await createWorkspace(adminCookie, "roles-co");
    await insertUser("mem@example.com", "user");
    const [mem] = await db.select().from(user).where(eq(user.email, "mem@example.com"));
    await db.insert(member).values({ organizationId: orgId, userId: mem.id, role: "member" });
    const memCookie = await signIn("mem@example.com");

    const invite = await SELF.fetch(`${BASE}/organization/invite-member`, {
      method: "POST",
      headers: { ...json, cookie: memCookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: orgId, email: "x@example.com", role: "member" }),
    });
    expect(invite.status).toBe(403);

    const del = await SELF.fetch(`${BASE}/organization/delete`, {
      method: "POST",
      headers: { ...json, cookie: memCookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: orgId }),
    });
    expect(del.status).toBe(403);
    const rows = await db.select().from(workspace).where(eq(workspace.id, orgId));
    expect(rows).toHaveLength(1);
  });

  it("blocks deleting a workspace that still has an app, and deletes one without", async () => {
    const adminCookie = await cookieFor("admin-delete@example.com", "admin");
    const withApp = await createWorkspace(adminCookie, "has-app");
    await db.insert(app).values({ workspaceId: withApp, name: "Shop", slug: "shop" });
    const blocked = await SELF.fetch(`${BASE}/organization/delete`, {
      method: "POST",
      headers: { ...json, cookie: adminCookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: withApp }),
    });
    expect(blocked.status).toBe(400);
    expect(await blocked.text()).toContain("workspace still has apps");
    expect(await db.select().from(workspace).where(eq(workspace.id, withApp))).toHaveLength(1);

    const empty = await createWorkspace(adminCookie, "no-app");
    const ok = await SELF.fetch(`${BASE}/organization/delete`, {
      method: "POST",
      headers: { ...json, cookie: adminCookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: empty }),
    });
    expect(ok.status).toBe(200);
    expect(await db.select().from(workspace).where(eq(workspace.id, empty))).toHaveLength(0);
  });

  it("lets an admin set a role, and refuses a non-admin", async () => {
    const adminCookie = await cookieFor("admin-role@example.com", "admin");
    const plainCookie = await cookieFor("plain-role@example.com", "user");
    const [target] = await db.select().from(user).where(eq(user.email, "plain-role@example.com"));

    const denied = await SELF.fetch(`${BASE}/admin/set-role`, {
      method: "POST",
      headers: { ...json, cookie: plainCookie, origin: ORIGIN },
      body: JSON.stringify({ userId: target.id, role: "admin" }),
    });
    expect(denied.status).toBe(403);

    const ok = await SELF.fetch(`${BASE}/admin/set-role`, {
      method: "POST",
      headers: { ...json, cookie: adminCookie, origin: ORIGIN },
      body: JSON.stringify({ userId: target.id, role: "admin" }),
    });
    expect(ok.status).toBe(200);
    const [row] = await db.select().from(user).where(eq(user.id, target.id));
    expect(row.role).toBe("admin");
  });

  it("bans a user so their OTP sign-in fails, and refuses a non-admin ban", async () => {
    const adminCookie = await cookieFor("admin-ban@example.com", "admin");
    const plainCookie = await cookieFor("plain-ban@example.com", "user");
    await insertUser("victim@example.com", "user");
    const [victim] = await db.select().from(user).where(eq(user.email, "victim@example.com"));

    const denied = await SELF.fetch(`${BASE}/admin/ban-user`, {
      method: "POST",
      headers: { ...json, cookie: plainCookie, origin: ORIGIN },
      body: JSON.stringify({ userId: victim.id }),
    });
    expect(denied.status).toBe(403);

    const ban = await SELF.fetch(`${BASE}/admin/ban-user`, {
      method: "POST",
      headers: { ...json, cookie: adminCookie, origin: ORIGIN },
      body: JSON.stringify({ userId: victim.id, banReason: "test" }),
    });
    expect(ban.status).toBe(200);

    await sendOtp("victim@example.com");
    const res = await SELF.fetch(`${BASE}/sign-in/email-otp`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email: "victim@example.com", otp: memoryOtpMailer.lastOtp("victim@example.com") }),
    });
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie().join("")).not.toMatch(/session_token=/);
  });

  it("lets an admin impersonate a user, and refuses a non-admin", async () => {
    const adminCookie = await cookieFor("admin-imp@example.com", "admin");
    const plainCookie = await cookieFor("plain-imp@example.com", "user");
    const [target] = await db.select().from(user).where(eq(user.email, "plain-imp@example.com"));

    const denied = await SELF.fetch(`${BASE}/admin/impersonate-user`, {
      method: "POST",
      headers: { ...json, cookie: plainCookie, origin: ORIGIN },
      body: JSON.stringify({ userId: target.id }),
    });
    expect(denied.status).toBe(403);

    const ok = await SELF.fetch(`${BASE}/admin/impersonate-user`, {
      method: "POST",
      headers: { ...json, cookie: adminCookie, origin: ORIGIN },
      body: JSON.stringify({ userId: target.id }),
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.getSetCookie().join("")).toMatch(/session_token=/);
  });
});

describe("invite mailer", () => {
  it("fails closed when unset and stores the invite id for memory", async () => {
    expect(() => pickInviteMailer(undefined)).toThrow("no invite mailer configured");
    expect(pickInviteMailer("memory")).toBe(memoryInviteMailer);
    await memoryInviteMailer.send("Memo@Example.com", { id: "inv_abc", role: "member" });
    expect(memoryInviteMailer.lastInvite("memo@example.com")?.id).toBe("inv_abc");
  });

  it("console mailer logs a masked address and never the invite id", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((msg: string) => logs.push(String(msg)));
    try {
      await consoleInviteMailer.send("bob@example.com", { id: "inv_secret123", role: "member" });
    } finally {
      spy.mockRestore();
    }
    expect(logs).toEqual(["[invite] sent to b***@example.com"]);
  });
});

describe("auth rate limit", () => {
  const sendFrom = (ip: string, email: string) =>
    SELF.fetch(`${BASE}/email-otp/send-verification-otp`, {
      method: "POST",
      headers: { ...json, "cf-connecting-ip": ip },
      body: JSON.stringify({ email, type: "sign-in" }),
    });

  it("returns 429 on the 6th OTP send to one email from one IP, and not for another IP", async () => {
    await insertUser("limited@example.com", "user");
    for (let i = 0; i < 5; i++) {
      expect((await sendFrom("198.51.100.7", "limited@example.com")).status).toBe(200);
    }
    expect((await sendFrom("198.51.100.7", "limited@example.com")).status).toBe(429);
    expect((await sendFrom("198.51.100.8", "limited@example.com")).status).toBe(200);
  });

  it("returns 429 on the 6th OTP check from one IP", async () => {
    const check = () =>
      SELF.fetch(`${BASE}/email-otp/check-verification-otp`, {
        method: "POST",
        headers: { ...json, "cf-connecting-ip": "198.51.100.30" },
        body: JSON.stringify({ email: "guess@example.com", type: "sign-in", otp: "000000" }),
      });
    for (let i = 0; i < 5; i++) expect((await check()).status).not.toBe(429);
    expect((await check()).status).toBe(429);
  });
});

describe("password mail paths", () => {
  it.each([
    ["/email-otp/request-password-reset", {}],
    ["/forget-password/email-otp", {}],
    ["/email-otp/send-verification-otp", { type: "forget-password" }],
  ])("%s returns 404 and mails no OTP to an existing user", async (path, extra) => {
    const email = `${newId("usr")}@example.com`;
    await insertUser(email, "user");
    const res = await SELF.fetch(`${BASE}${path}`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ email, ...extra }),
    });
    expect(res.status).toBe(404);
    expect(memoryOtpMailer.lastOtp(email)).toBeUndefined();
  });
});


describe("security log and suspension", () => {
  it("writes a sign_in.success row whose data holds no OTP", async () => {
    await insertUser("audit@example.com", "user");
    const otp = await sendOtp("audit@example.com");
    const res = await SELF.fetch(`${BASE}/sign-in/email-otp`, {
      method: "POST",
      headers: { ...json, ...freshIp() },
      body: JSON.stringify({ email: "audit@example.com", otp }),
    });
    expect(res.status).toBe(200);

    const [owner] = await db.select().from(user).where(eq(user.email, "audit@example.com"));
    const rows = await db
      .select()
      .from(securityAudit)
      .where(and(eq(securityAudit.action, "sign_in.success"), eq(securityAudit.target, owner.id)));
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain(otp);
  });

  it("writes a sign_in.failure row for a wrong OTP", async () => {
    await insertUser("denied@example.com", "user");
    await sendOtp("denied@example.com");
    const res = await SELF.fetch(`${BASE}/sign-in/email-otp`, {
      method: "POST",
      headers: { ...json, ...freshIp() },
      body: JSON.stringify({ email: "denied@example.com", otp: "000000" }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const rows = await db
      .select()
      .from(securityAudit)
      .where(and(eq(securityAudit.action, "sign_in.failure"), eq(securityAudit.target, "denied@example.com")));
    expect(rows).toHaveLength(1);
  });

  it("records the acting admin on role.change and workspace.create", async () => {
    const adminCookie = await cookieFor("audit-admin@example.com", "admin");
    await insertUser("audit-target@example.com", "user");
    const [target] = await db.select().from(user).where(eq(user.email, "audit-target@example.com"));
    const [admin] = await db.select().from(user).where(eq(user.email, "audit-admin@example.com"));

    const role = await SELF.fetch(`${BASE}/admin/set-role`, {
      method: "POST",
      headers: { ...json, cookie: adminCookie, origin: ORIGIN },
      body: JSON.stringify({ userId: target.id, role: "admin" }),
    });
    expect(role.status).toBe(200);
    const [roleRow] = await db
      .select()
      .from(securityAudit)
      .where(and(eq(securityAudit.action, "role.change"), eq(securityAudit.target, target.id)));
    expect(roleRow).toMatchObject({ actorUserId: admin.id, data: '{"role":"admin"}' });

    const orgId = await createWorkspace(adminCookie, "audit-co");
    const [createRow] = await db
      .select()
      .from(securityAudit)
      .where(and(eq(securityAudit.action, "workspace.create"), eq(securityAudit.workspaceId, orgId)));
    expect(createRow).toMatchObject({ actorUserId: admin.id, target: orgId });
  });

  it("refuses organization endpoints while the active workspace is suspended", async () => {
    const cookie = await cookieFor("suspend-admin@example.com", "admin");
    const orgId = await createWorkspace(cookie, "suspend-co");
    const setActive = await SELF.fetch(`${BASE}/organization/set-active`, {
      method: "POST",
      headers: { ...json, cookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: orgId }),
    });
    expect(setActive.status).toBe(200);

    const invite = (email: string) =>
      SELF.fetch(`${BASE}/organization/invite-member`, {
        method: "POST",
        headers: { ...json, cookie, origin: ORIGIN },
        body: JSON.stringify({ organizationId: orgId, email, role: "member" }),
      });
    expect((await invite("s1@example.com")).status).toBe(200);

    await db.update(workspace).set({ status: "suspended" }).where(eq(workspace.id, orgId));
    expect((await invite("s2@example.com")).status).toBe(403);

    await db.update(workspace).set({ status: "active" }).where(eq(workspace.id, orgId));
    expect((await invite("s3@example.com")).status).toBe(200);
  });

  it("refuses to delete a workspace that still has addresses in relay-core", async () => {
    const cookie = await cookieFor("addr-admin@example.com", "admin");
    const orgId = await createWorkspace(cookie, "addr-co");
    await coreDb(env).insert(address).values({ workspaceId: orgId, appId: "app_none", email: "guard@addr-co.test", kind: "inbox" });

    const del = () =>
      SELF.fetch(`${BASE}/organization/delete`, {
        method: "POST",
        headers: { ...json, cookie, origin: ORIGIN },
        body: JSON.stringify({ organizationId: orgId }),
      });
    const blocked = await del();
    expect(blocked.status).toBe(400);
    expect(await blocked.text()).toContain("workspace still has addresses");

    await coreDb(env).delete(address).where(eq(address.workspaceId, orgId));
    expect((await del()).status).toBe(200);
  });

  it("refuses an org mutation that names a suspended workspace while the active one is fine", async () => {
    const cookie = await cookieFor("named-admin@example.com", "admin");
    const active = await createWorkspace(cookie, "named-active");
    const suspended = await createWorkspace(cookie, "named-suspended");
    const setActive = await SELF.fetch(`${BASE}/organization/set-active`, {
      method: "POST",
      headers: { ...json, cookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: active }),
    });
    expect(setActive.status).toBe(200);
    await db.update(workspace).set({ status: "suspended" }).where(eq(workspace.id, suspended));

    const res = await SELF.fetch(`${BASE}/organization/invite-member`, {
      method: "POST",
      headers: { ...json, cookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: suspended, email: "named@example.com", role: "member" }),
    });
    expect(res.status).toBe(403);
  });

  it("refuses set-active into a suspended workspace", async () => {
    const cookie = await cookieFor("switch-admin@example.com", "admin");
    const active = await createWorkspace(cookie, "switch-active");
    const target = await createWorkspace(cookie, "switch-target");
    await SELF.fetch(`${BASE}/organization/set-active`, {
      method: "POST",
      headers: { ...json, cookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: active }),
    });
    await db.update(workspace).set({ status: "suspended" }).where(eq(workspace.id, target));

    const res = await SELF.fetch(`${BASE}/organization/set-active`, {
      method: "POST",
      headers: { ...json, cookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: target }),
    });
    expect(res.status).toBe(403);
  });

  it("lets a user whose active workspace is suspended set-active to an active one", async () => {
    const cookie = await cookieFor("escape-admin@example.com", "admin");
    const suspendedActive = await createWorkspace(cookie, "escape-suspended");
    const other = await createWorkspace(cookie, "escape-other");
    await SELF.fetch(`${BASE}/organization/set-active`, {
      method: "POST",
      headers: { ...json, cookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: suspendedActive }),
    });
    await db.update(workspace).set({ status: "suspended" }).where(eq(workspace.id, suspendedActive));

    const res = await SELF.fetch(`${BASE}/organization/set-active`, {
      method: "POST",
      headers: { ...json, cookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: other }),
    });
    expect(res.status).toBe(200);
  });

  it("writes one member.role_change row when an owner changes a member's role", async () => {
    const cookie = await cookieFor("role-owner@example.com", "admin");
    const orgId = await createWorkspace(cookie, "role-co");
    await insertUser("role-member@example.com", "user");
    const [target] = await db.select().from(user).where(eq(user.email, "role-member@example.com"));
    const [mem] = await db.insert(member).values({ organizationId: orgId, userId: target.id, role: "member" }).returning();

    const res = await SELF.fetch(`${BASE}/organization/update-member-role`, {
      method: "POST",
      headers: { ...json, cookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: orgId, memberId: mem.id, role: "admin" }),
    });
    expect(res.status).toBe(200);
    const rows = await db
      .select()
      .from(securityAudit)
      .where(and(eq(securityAudit.action, "member.role_change"), eq(securityAudit.workspaceId, orgId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ target: target.id, data: '{"from":"member","to":"admin"}' });
  });
});
