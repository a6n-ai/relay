import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { securityDb } from "../src/db/security/client";
import { securityAudit, session, user } from "../src/db/security/schema";
import type { Env } from "../src/env";
import { createAuth, isFreshSession, recordPasswordChange } from "../src/lib/auth";
import { memoryOtpMailer } from "../src/lib/auth/otp-mailer";
import { applyMigrations } from "./migrate";
import { BASE, cookieFor, freshIp, headersFor, insertUser, json, ORIGIN, signIn } from "./console-helpers";

beforeAll(async () => {
  await applyMigrations();
});

const post = (path: string, body: unknown, extra: Record<string, string> = {}) =>
  SELF.fetch(`${BASE}${path}`, { method: "POST", headers: { ...json, origin: ORIGIN, ...freshIp(), ...extra }, body: JSON.stringify(body) });

async function setPassword(email: string, password: string) {
  const cookie = await cookieFor(email, "user");
  await createAuth(env as Env).api.setPassword({ headers: headersFor(cookie), body: { newPassword: password } });
}

async function auditActions(email: string): Promise<string[]> {
  const [u] = await securityDb(env).select({ id: user.id }).from(user).where(eq(user.email, email));
  const rows = await securityDb(env).select({ action: securityAudit.action }).from(securityAudit).where(eq(securityAudit.actorUserId, u.id));
  return rows.map((r) => r.action);
}

const changePassword = (cookie: string, body: Record<string, unknown>) => post("/change-password", body, { cookie });

describe("password sign-in", () => {
  it("refuses password sign-up and creates no user", async () => {
    const res = await post("/sign-up/email", { email: "newbie@example.com", password: "correct-horse-1", name: "New" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await securityDb(env).select().from(user).where(eq(user.email, "newbie@example.com"))).toHaveLength(0);
  });

  it("signs in with a set password; a wrong password and an unknown email both give the same 401", async () => {
    await setPassword("pw@example.com", "correct-horse-1");
    const ok = await post("/sign-in/email", { email: "pw@example.com", password: "correct-horse-1" });
    expect(ok.status).toBe(200);
    expect(ok.headers.getSetCookie().join(";")).toMatch(/better-auth\.session_token=/);

    const wrong = await post("/sign-in/email", { email: "pw@example.com", password: "wrong-horse-99" });
    const unknown = await post("/sign-in/email", { email: "nobody@example.com", password: "wrong-horse-99" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.text()).toBe(await unknown.text());
  });

  it("refuses setPassword without a session", async () => {
    await expect(createAuth(env as Env).api.setPassword({ headers: new Headers(), body: { newPassword: "correct-horse-1" } })).rejects.toThrow();
  });

  it("has no HTTP route for setPassword", async () => {
    const cookie = await cookieFor("noroute@example.com", "user");
    const res = await post("/set-password", { newPassword: "correct-horse-1" }, { cookie });
    expect(res.status).toBe(404);
  });

  it("answers a reset request the same for a known and an unknown email, and mails only the known one", async () => {
    await insertUser("known@example.com", "user");
    const known = await post("/request-password-reset", { email: "known@example.com", redirectTo: "/reset-password" });
    const unknown = await post("/request-password-reset", { email: "stranger@example.com", redirectTo: "/reset-password" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(known.status);
    expect(await unknown.text()).toBe(await known.text());
    await expect.poll(() => memoryOtpMailer.lastOtp("known@example.com")).toContain("/reset-password/");
    expect(memoryOtpMailer.lastOtp("stranger@example.com")).toBeUndefined();
  });

  it("resets by link, then signs in with the new password and loses old sessions", async () => {
    const oldCookie = await cookieFor("reset@example.com", "user");
    await post("/request-password-reset", { email: "reset@example.com", redirectTo: "/reset-password" });
    await expect.poll(() => memoryOtpMailer.lastOtp("reset@example.com")).toBeTruthy();
    const token = new URL(memoryOtpMailer.lastOtp("reset@example.com")!).pathname.split("/").pop();
    const res = await post("/reset-password", { newPassword: "brand-new-pass-1", token });
    expect(res.status).toBe(200);
    expect(memoryOtpMailer.noticeCount("reset@example.com")).toBe(1);
    expect(await auditActions("reset@example.com")).toContain("password.reset");
    expect((await post("/sign-in/email", { email: "reset@example.com", password: "brand-new-pass-1" })).status).toBe(200);
    const session = await SELF.fetch(`${BASE}/get-session?disableCookieCache=true`, { headers: { cookie: oldCookie } });
    expect(await session.json()).toBeNull();
    expect((await post("/reset-password", { newPassword: "another-pass-123", token })).status).toBe(400);
  });

  it("caps password sign-in per email across IPs", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await post("/sign-in/email", { email: "capped@example.com", password: "wrong-horse-99" })).status;
    expect(last).toBe(429);
  });

  it("judges a session fresh for 10 minutes", () => {
    expect(isFreshSession(new Date())).toBe(true);
    expect(isFreshSession(new Date(Date.now() - 11 * 60_000))).toBe(false);
  });

  it("sends a notice and writes an audit row for a set password", async () => {
    await insertUser("setter@example.com", "user");
    const [u] = await securityDb(env).select().from(user).where(eq(user.email, "setter@example.com"));
    await recordPasswordChange(env as Env, u, "password.set");
    expect(memoryOtpMailer.noticeCount("setter@example.com")).toBe(1);
    expect(await auditActions("setter@example.com")).toEqual(["password.set"]);
  });

  it("refuses a password change from a stale session, and changes it from a fresh one with notice and audit", async () => {
    await setPassword("changer@example.com", "correct-horse-1");
    const cookie = await signIn("changer@example.com");
    const body = { currentPassword: "correct-horse-1", newPassword: "newer-horse-22" };

    const [u] = await securityDb(env).select({ id: user.id }).from(user).where(eq(user.email, "changer@example.com"));
    await securityDb(env).update(session).set({ createdAt: new Date(Date.now() - 60 * 60_000) }).where(eq(session.userId, u.id));
    const stale = await changePassword(cookie, body);
    expect(stale.status).toBe(403);
    expect(await stale.text()).toContain("Sign in again");
    expect(memoryOtpMailer.noticeCount("changer@example.com")).toBe(0);

    const fresh = await signIn("changer@example.com");
    expect((await changePassword(fresh, body)).status).toBe(200);
    expect(memoryOtpMailer.noticeCount("changer@example.com")).toBe(1);
    expect(await auditActions("changer@example.com")).toContain("password.change");
  });
});
