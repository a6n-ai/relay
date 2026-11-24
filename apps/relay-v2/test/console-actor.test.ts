import { env, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor, requirePlatformAdmin } from "../src/console/actor";
import { securityDb } from "../src/db/security/client";
import { member, session, user, workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";
import { addMember, BASE, cookieFor, createWorkspace, insertUser, json, ORIGIN, sendOtp, setActive } from "./console-helpers";

const db = securityDb(env);
const headersFor = (cookie: string, extra: Record<string, string> = {}) => new Headers({ cookie, ...extra });
const userIdOf = async (email: string): Promise<string> => {
  const [u] = await db.select().from(user).where(eq(user.email, email));
  return u.id;
};

beforeAll(async () => {
  await applyMigrations();
});

describe("requireActor", () => {
  it("rejects no session", async () => {
    await expect(requireActor(env, new Headers())).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a non-member", async () => {
    const ownerCookie = await cookieFor("nm-owner@example.com", "admin");
    const wsId = await createWorkspace(ownerCookie, "nm-ws");
    const cookie = await cookieFor("nm-stranger@example.com", "user");
    await db
      .update(session)
      .set({ activeOrganizationId: wsId })
      .where(eq(session.userId, await userIdOf("nm-stranger@example.com")));
    await expect(requireActor(env, headersFor(cookie))).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a role without the permission", async () => {
    const ownerCookie = await cookieFor("perm-owner@example.com", "admin");
    const wsId = await createWorkspace(ownerCookie, "perm-ws");
    await setActive(ownerCookie, wsId);
    const memberCookie = await addMember(wsId, "perm-member@example.com", "member");
    const need = { permission: { tenant: ["write"] } };
    await expect(requireActor(env, headersFor(memberCookie), need)).rejects.toMatchObject({ status: 403 });
    await expect(requireActor(env, headersFor(ownerCookie), need)).resolves.toMatchObject({ roles: ["owner"] });
  });

  it("reads the session fresh", async () => {
    const adminCookie = await cookieFor("fresh-admin@example.com", "admin");
    const wsId = await createWorkspace(adminCookie, "fresh-ws");
    const victimCookie = await addMember(wsId, "fresh-victim@example.com", "member");
    await expect(requireActor(env, headersFor(victimCookie))).resolves.toBeDefined();
    const ban = await SELF.fetch(`${BASE}/admin/ban-user`, {
      method: "POST",
      headers: { ...json, cookie: adminCookie, origin: ORIGIN },
      body: JSON.stringify({ userId: await userIdOf("fresh-victim@example.com") }),
    });
    expect(ban.status).toBe(200);
    await expect(requireActor(env, headersFor(victimCookie))).rejects.toMatchObject({ status: 401 });
  });

  it("suspended: read ok, write refused", async () => {
    const ownerCookie = await cookieFor("susp-owner@example.com", "admin");
    const wsId = await createWorkspace(ownerCookie, "susp-ws");
    await setActive(ownerCookie, wsId);
    await db.update(workspace).set({ status: "suspended" }).where(eq(workspace.id, wsId));
    await expect(requireActor(env, headersFor(ownerCookie), {})).resolves.toMatchObject({ workspaceStatus: "suspended" });
    await expect(requireActor(env, headersFor(ownerCookie), { write: true })).rejects.toMatchObject({
      status: 403,
      message: "workspace suspended",
    });
  });

  it("write needs same origin", async () => {
    const ownerCookie = await cookieFor("origin-owner@example.com", "admin");
    const wsId = await createWorkspace(ownerCookie, "origin-ws");
    await setActive(ownerCookie, wsId);
    await expect(
      requireActor(env, headersFor(ownerCookie, { origin: "https://evil.example" }), { write: true }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      requireActor(env, headersFor(ownerCookie, { origin: ORIGIN }), { write: true }),
    ).resolves.toBeDefined();
    await expect(requireActor(env, headersFor(ownerCookie), { write: true })).resolves.toBeDefined();
  });

  it("stale active workspace: a removed member gets 403", async () => {
    const adminCookie = await cookieFor("stale-admin@example.com", "admin");
    const wsId = await createWorkspace(adminCookie, "stale-ws");
    const memberCookie = await addMember(wsId, "stale-member@example.com", "member");
    await expect(requireActor(env, headersFor(memberCookie))).resolves.toBeDefined();
    await db
      .delete(member)
      .where(and(eq(member.organizationId, wsId), eq(member.userId, await userIdOf("stale-member@example.com"))));
    await expect(requireActor(env, headersFor(memberCookie))).rejects.toMatchObject({ status: 403 });
  });
});

describe("requirePlatformAdmin", () => {
  it("404s for a user and resolves for an admin", async () => {
    const userCookie = await cookieFor("pa-user@example.com", "user");
    await expect(requirePlatformAdmin(env, headersFor(userCookie))).rejects.toMatchObject({ status: 404 });
    const adminCookie = await cookieFor("pa-admin@example.com", "admin");
    await expect(requirePlatformAdmin(env, headersFor(adminCookie))).resolves.toMatchObject({
      userId: await userIdOf("pa-admin@example.com"),
    });
  });
});

describe("dev otp peek", () => {
  it("is 404 without DEV_OTP_PEEK", async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/dev/otp?email=peek@example.com`);
    expect(res.status).toBe(404);
  });

  it("returns the code only with DEV_OTP_PEEK=1 on localhost", async () => {
    await insertUser("peek@example.com", "user");
    const otp = await sendOtp("peek@example.com");
    env.DEV_OTP_PEEK = "1";
    try {
      const res = await SELF.fetch(`${ORIGIN}/api/dev/otp?email=peek@example.com`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ otp });
    } finally {
      delete env.DEV_OTP_PEEK;
    }
  });
});
