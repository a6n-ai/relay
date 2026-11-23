import { applyD1Migrations, env, SELF, type D1Migration } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { centralDb } from "../src/db/central/client";
import { member, workspace } from "../src/db/central/schema";
import { memoryOtpMailer } from "../src/lib/auth/otp-mailer";

const { TEST_MIGRATIONS } = env as typeof env & { TEST_MIGRATIONS: D1Migration[] };
const BASE = "https://relay.test/api/auth";
const json = { "content-type": "application/json" };

beforeAll(async () => {
  await applyD1Migrations(env.CENTRAL, TEST_MIGRATIONS);
});

async function signIn(email: string): Promise<string> {
  const sent = await SELF.fetch(`${BASE}/email-otp/send-verification-otp`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  expect(sent.status).toBe(200);
  const otp = memoryOtpMailer.lastOtp(email);
  expect(otp).toMatch(/^\d{6}$/);

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
    const cookie = await signIn("owner@example.com");
    expect(cookie).toMatch(/better-auth\.session_token=/);
  });

  it("creates a workspace with a wsp_ id, default quota, and an owner member", async () => {
    const cookie = await signIn("creator@example.com");
    const res = await SELF.fetch(`${BASE}/organization/create`, {
      method: "POST",
      headers: { ...json, cookie, origin: "https://relay.test" },
      body: JSON.stringify({ name: "Acme", slug: "acme" }),
    });
    expect(res.status).toBe(200);
    const org = (await res.json()) as { id: string };
    expect(org.id).toMatch(/^wsp_/);

    const db = centralDb(env);
    const [row] = await db.select().from(workspace).where(eq(workspace.id, org.id));
    expect(row.monthlyMessageQuota).toBe(10000);

    const [m] = await db.select().from(member).where(eq(member.organizationId, org.id));
    expect(m.role).toBe("owner");
  });

  it("rejects organization/create without a session with 401", async () => {
    const res = await SELF.fetch(`${BASE}/organization/create`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ name: "Nope", slug: "nope" }),
    });
    expect(res.status).toBe(401);
  });
});
