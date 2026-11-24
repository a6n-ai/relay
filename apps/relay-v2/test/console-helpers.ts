import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { expect } from "vitest";
import type { OrgRole } from "../src/console/actor";
import { securityDb } from "../src/db/security/client";
import { member, user } from "../src/db/security/schema";
import { memoryOtpMailer } from "../src/lib/auth/otp-mailer";
import { newId } from "../src/lib/ids";

export const ORIGIN = "http://localhost";
export const BASE = `${ORIGIN}/api/auth`;
export const json = { "content-type": "application/json" };
const db = securityDb(env);

export async function insertUser(email: string, role: "user" | "admin"): Promise<void> {
  await db.insert(user).values({ id: newId("usr"), name: email, email, role });
}

// Each helper call gets its own client IP, so the per-IP OTP limit never trips across tests.
let ipSeq = 0;
export function freshIp(): Record<string, string> {
  ipSeq += 1;
  return { "cf-connecting-ip": `10.0.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}` };
}

export async function sendOtp(email: string): Promise<string> {
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

export async function signIn(email: string): Promise<string> {
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

export async function cookieFor(email: string, role: "user" | "admin"): Promise<string> {
  await insertUser(email, role);
  return signIn(email);
}

export async function createWorkspace(cookie: string, slug: string): Promise<string> {
  const res = await SELF.fetch(`${BASE}/organization/create`, {
    method: "POST",
    headers: { ...json, cookie, origin: ORIGIN },
    body: JSON.stringify({ name: slug, slug }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { id: string }).id;
}

export async function setActive(cookie: string, workspaceId: string): Promise<void> {
  const res = await SELF.fetch(`${BASE}/organization/set-active`, {
    method: "POST",
    headers: { ...json, cookie, origin: ORIGIN },
    body: JSON.stringify({ organizationId: workspaceId }),
  });
  expect(res.status).toBe(200);
}

// Creates the user, adds the member row directly, and returns a cookie whose active workspace is workspaceId.
export async function addMember(workspaceId: string, email: string, role: OrgRole): Promise<string> {
  await insertUser(email, "user");
  const [u] = await db.select().from(user).where(eq(user.email, email));
  await db.insert(member).values({ organizationId: workspaceId, userId: u.id, role });
  const cookie = await signIn(email);
  await setActive(cookie, workspaceId);
  return cookie;
}
