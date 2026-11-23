import { applyD1Migrations, env, SELF, type D1Migration } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centralDb } from "../src/db/central/client";
import { member, user, verification, workspace } from "../src/db/central/schema";
import { createAuth, pickMailer } from "../src/lib/auth";
import { memoryOtpMailer } from "../src/lib/auth/otp-mailer";
import { newId } from "../src/lib/ids";
import type { Env } from "../src/env";

const { TEST_MIGRATIONS } = env as typeof env & { TEST_MIGRATIONS: D1Migration[] };
const ORIGIN = "http://localhost";
const BASE = `${ORIGIN}/api/auth`;
const json = { "content-type": "application/json" };
const db = centralDb(env);

beforeAll(async () => {
  await applyD1Migrations(env.CENTRAL, TEST_MIGRATIONS);
});

async function insertUser(email: string, role: "user" | "admin"): Promise<void> {
  await db.insert(user).values({ id: newId("usr"), name: email, email, role });
}

async function sendOtp(email: string): Promise<string> {
  const sent = await SELF.fetch(`${BASE}/email-otp/send-verification-otp`, {
    method: "POST",
    headers: json,
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
    headers: json,
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

    const [row] = await db.select().from(workspace).where(eq(workspace.id, org.id));
    expect(row.monthlyMessageQuota).toBe(10000);

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
