import { env, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { addApp } from "../src/services/apps";
import { createWorkspace as createWorkspaceFromConsole } from "../src/services/workspaces";
import { getWorkspaceProfile, recordDoState } from "../src/core/workspace-profile";
import { coreDb } from "../src/db/core/client";
import { workspaceProfile } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { member, user, workspace } from "../src/db/security/schema";
import { addMember, BASE, cookieFor, createWorkspace, json, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

const headersFor = (cookie: string) => new Headers({ cookie });
const WRITE = { permission: { tenant: ["write"] }, write: true };

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

const profileOf = async (workspaceId: string) =>
  (await coreDb(env).select().from(workspaceProfile).where(eq(workspaceProfile.workspaceId, workspaceId)))[0];

function postCreate(cookie: string, slug: string) {
  return SELF.fetch(`${BASE}/organization/create`, {
    method: "POST",
    headers: { ...json, cookie, origin: ORIGIN },
    body: JSON.stringify({ name: slug, slug }),
  });
}

describe("self-serve workspaces", { timeout: 60_000 }, () => {
  it("lets a plain user create 3 self-serve workspaces with 100 sends a month, and refuses the 4th", async () => {
    const cookie = await cookieFor("ss-plain@example.com", "user");
    for (const slug of ["ss-plain-1", "ss-plain-2", "ss-plain-3"]) {
      const id = await createWorkspace(cookie, slug);
      expect(await profileOf(id)).toMatchObject({ selfServe: true, monthlyMessageQuota: 100 });
    }

    const fourth = await postCreate(cookie, "ss-plain-4");
    expect(fourth.status).toBe(403);
    expect(await fourth.json()).toMatchObject({ message: "You can create up to 3 workspaces" });
  });

  it("lets an admin create 5 workspaces that are not self-serve, with the 10000 default quota", async () => {
    const cookie = await cookieFor("ss-admin@example.com", "admin");
    for (const slug of ["ss-admin-1", "ss-admin-2", "ss-admin-3", "ss-admin-4", "ss-admin-5"]) {
      const id = await createWorkspace(cookie, slug);
      expect(await profileOf(id)).toMatchObject({ selfServe: false, monthlyMessageQuota: 10000 });
    }
  });

  it("does not count an admin-created workspace the user owns toward the cap", async () => {
    const adminCookie = await cookieFor("ss-owned-admin@example.com", "admin");
    const adminWorkspace = await createWorkspace(adminCookie, "ss-owned-by-admin");
    const cookie = await addMember(adminWorkspace, "ss-owner-plain@example.com", "owner");

    for (const slug of ["ss-owner-1", "ss-owner-2", "ss-owner-3"]) {
      expect((await postCreate(cookie, slug)).status).toBe(200);
    }
    expect((await postCreate(cookie, "ss-owner-4")).status).toBe(403);
  });

  it("refuses a second app in a self-serve workspace", async () => {
    const cookie = await cookieFor("ss-apps@example.com", "user");
    const id = await createWorkspace(cookie, "ss-apps-co");
    await setActive(cookie, id);
    const actor = await requireActor(env, headersFor(cookie), WRITE);

    await addApp(env, actor, { name: "Web", slug: "web" });
    await expect(addApp(env, actor, { name: "Mail", slug: "mail" })).rejects.toMatchObject({
      status: 403,
      message: "self-serve workspaces have one app",
    });
  });

  it("creates through the console path with the same cap, and refuses a cross-origin write", async () => {
    const cookie = await cookieFor("ss-console@example.com", "user");
    const headers = new Headers({ cookie, origin: ORIGIN });
    for (const slug of ["ss-console-1", "ss-console-2", "ss-console-3"]) {
      const { id } = await createWorkspaceFromConsole(env, headers, { name: slug, slug });
      expect(await profileOf(id)).toMatchObject({ selfServe: true, monthlyMessageQuota: 100 });
    }
    await expect(createWorkspaceFromConsole(env, headers, { name: "ss-console-4", slug: "ss-console-4" })).rejects.toMatchObject({
      status: 403,
      message: "You can create up to 3 workspaces",
    });

    const other = await cookieFor("ss-cross@example.com", "user");
    const cross = new Headers({ cookie: other, origin: "https://evil.example" });
    await expect(createWorkspaceFromConsole(env, cross, { name: "ss-cross", slug: "ss-cross" })).rejects.toMatchObject({ status: 403 });
    expect(await securityDb(env).select({ id: workspace.id }).from(workspace).where(eq(workspace.slug, "ss-cross"))).toHaveLength(0);
  });

  it("repairs a missing profile as self-serve with 100 sends a month", async () => {
    const [ws] = await securityDb(env).insert(workspace).values({ name: "ss-repair", slug: "ss-repair" }).returning();

    await expect(getWorkspaceProfile(env, ws.id)).resolves.toMatchObject({ selfServe: true, monthlyMessageQuota: 100 });
  });

  it("keeps counting workspaces the user created after they add a second owner and leave", async () => {
    const email = "ss-leave@example.com";
    const cookie = await cookieFor(email, "user");
    const first = await createWorkspace(cookie, "ss-leave-1");
    await createWorkspace(cookie, "ss-leave-2");
    await createWorkspace(cookie, "ss-leave-3");
    await addMember(first, "ss-leave-co@example.com", "owner");

    const left = await SELF.fetch(`${BASE}/organization/leave`, {
      method: "POST",
      headers: { ...json, cookie, origin: ORIGIN },
      body: JSON.stringify({ organizationId: first }),
    });
    expect(left.status).toBe(200);
    const [u] = await securityDb(env).select({ id: user.id }).from(user).where(eq(user.email, email));
    expect(await securityDb(env).select().from(member).where(and(eq(member.organizationId, first), eq(member.userId, u.id)))).toHaveLength(0);

    const fourth = await postCreate(cookie, "ss-leave-4");
    expect(fourth.status).toBe(403);
    expect(await fourth.json()).toMatchObject({ message: "You can create up to 3 workspaces" });
  });

  it("does not recreate a missing profile from a DO report, and repair stays self-serve", async () => {
    const cookie = await cookieFor("ss-report@example.com", "user");
    const id = await createWorkspace(cookie, "ss-report-co");
    await coreDb(env).delete(workspaceProfile).where(eq(workspaceProfile.workspaceId, id));

    await expect(recordDoState(env, id, { doSchemaVersion: 1 })).resolves.toBe(false);
    expect(await profileOf(id)).toBeUndefined();
    await expect(getWorkspaceProfile(env, id)).resolves.toMatchObject({ selfServe: true, monthlyMessageQuota: 100 });
  });
});
