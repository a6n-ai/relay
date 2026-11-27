import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { deliveryEmail } from "../src/auth/recovery";
import { memoryOtpMailer } from "../src/auth/otp-mailer";
import { securityDb } from "../src/db/security/client";
import { account, invitation, member, user, workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";
import { BASE, freshIp, json, ORIGIN } from "./console-helpers";

beforeAll(async () => {
  await applyMigrations();
});

const db = () => securityDb(env);
let seq = 0;

async function seedInvite(email: string, over: { status?: string; expiresAt?: Date; recoveryEmail?: string | null } = {}) {
  seq += 1;
  const [ws] = await db().insert(workspace).values({ name: `w${seq}`, slug: `rec-${seq}` }).returning();
  const [inviter] = await db().insert(user).values({ name: "inv", email: `inviter${seq}@example.com` }).returning();
  await db().insert(invitation).values({
    organizationId: ws.id,
    email,
    inviterId: inviter.id,
    status: over.status ?? "pending",
    expiresAt: over.expiresAt ?? new Date(Date.now() + 86_400_000),
    recoveryEmail: over.recoveryEmail === undefined ? "r@x.test" : over.recoveryEmail,
  });
}

const post = (path: string, body: unknown) =>
  SELF.fetch(`${BASE}${path}`, { method: "POST", headers: { ...json, origin: ORIGIN, ...freshIp() }, body: JSON.stringify(body) });

describe("deliveryEmail", () => {
  it("user with recovery gets it", async () => {
    await db().insert(user).values({ name: "Ravi", email: "ravi@a6n.ai", recoveryEmail: "ravi@gmail.com" });
    expect(await deliveryEmail(env, "Ravi@A6n.ai")).toBe("ravi@gmail.com");
  });

  it("pending mailbox invite", async () => {
    await db().insert(user).values({ name: "P", email: "pend@a6n.ai" });
    await seedInvite("pend@a6n.ai");
    expect(await deliveryEmail(env, "pend@a6n.ai")).toBe("r@x.test");
  });

  it("cancelled or expired invite falls through", async () => {
    await seedInvite("canc@a6n.ai", { status: "canceled" });
    await seedInvite("exp@a6n.ai", { expiresAt: new Date(Date.now() - 1000) });
    expect(await deliveryEmail(env, "canc@a6n.ai")).toBe("canc@a6n.ai");
    expect(await deliveryEmail(env, "exp@a6n.ai")).toBe("exp@a6n.ai");
  });

  it("active account ignores a pending invite", async () => {
    const [ws] = await db().insert(workspace).values({ name: "act", slug: "rec-active" }).returning();
    const [withMember] = await db().insert(user).values({ name: "M", email: "mem@a6n.ai" }).returning();
    await db().insert(member).values({ organizationId: ws.id, userId: withMember.id, role: "member" });
    await seedInvite("mem@a6n.ai");
    expect(await deliveryEmail(env, "mem@a6n.ai")).toBe("mem@a6n.ai");
    const [withPassword] = await db().insert(user).values({ name: "C", email: "cred@a6n.ai" }).returning();
    await db().insert(account).values({ userId: withPassword.id, accountId: withPassword.id, providerId: "credential", password: "x" });
    await seedInvite("cred@a6n.ai");
    expect(await deliveryEmail(env, "cred@a6n.ai")).toBe("cred@a6n.ai");
  });

  it("plain user unchanged", async () => {
    expect(await deliveryEmail(env, "a@b.test")).toBe("a@b.test");
  });
});

describe("mail callbacks", () => {
  it("otp goes to recovery", async () => {
    await db().insert(user).values({ name: "O", email: "otp-rav@a6n.ai" });
    await seedInvite("otp-rav@a6n.ai", { recoveryEmail: "otp-r@x.test" });
    const res = await post("/email-otp/send-verification-otp", { email: "otp-rav@a6n.ai", type: "sign-in" });
    expect(res.status).toBe(200);
    await expect.poll(() => memoryOtpMailer.lastOtp("otp-r@x.test")).toBeDefined();
    expect(memoryOtpMailer.lastOtp("otp-rav@a6n.ai")).toBeUndefined();
  });

  it("reset goes to recovery", async () => {
    await db().insert(user).values({ name: "R", email: "rst-rav@a6n.ai" });
    await seedInvite("rst-rav@a6n.ai", { recoveryEmail: "rst-r@x.test" });
    const res = await post("/request-password-reset", { email: "rst-rav@a6n.ai", redirectTo: "/reset-password" });
    expect(res.status).toBe(200);
    await expect.poll(() => memoryOtpMailer.lastOtp("rst-r@x.test")).toContain("/reset-password/");
    expect(memoryOtpMailer.lastOtp("rst-rav@a6n.ai")).toBeUndefined();
  });
});
