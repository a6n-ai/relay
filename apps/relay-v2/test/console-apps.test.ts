import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { requireActor } from "../src/console/actor";
import { addApp, createKey, getApp, listApps, listKeys, revokeKey } from "../src/console/apps";
import { resolveApiKey } from "../src/core/api-keys";
import { addMember, cookieFor, createWorkspace, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

const headersFor = (cookie: string) => new Headers({ cookie });
const READ = { permission: { tenant: ["read"] } };
const WRITE = { permission: { tenant: ["write"] }, write: true };

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

async function workspaceFor(email: string, name: string) {
  const cookie = await cookieFor(email, "admin");
  const workspaceId = await createWorkspace(cookie, name);
  await setActive(cookie, workspaceId);
  return { cookie, workspaceId };
}

describe("console apps and API keys", { timeout: 60_000 }, () => {
  it("shows a created key once: it resolves to its workspace and app", async () => {
    const { cookie, workspaceId } = await workspaceFor("apps-owner@example.com", "Apps Owner Co");
    const actor = await requireActor(env, headersFor(cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });

    const { id, secret } = await createKey(env, actor, { appId, name: "web key" });
    expect(secret).toMatch(/^rk_/);
    expect(await resolveApiKey(env, secret)).toMatchObject({ workspaceId, appId, keyId: id });
  });

  it("lists keys without the key or the secret", async () => {
    const { cookie } = await workspaceFor("apps-list@example.com", "Apps List Co");
    const actor = await requireActor(env, headersFor(cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    const { id, secret } = await createKey(env, actor, { appId, name: "web key" });

    const rows = await listKeys(env, actor, appId);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).not.toContain("key");
    expect(Object.keys(rows[0])).not.toContain("secret");
    expect(JSON.stringify(rows)).not.toContain(secret);
    expect(rows[0]).toMatchObject({ id, name: "web key", enabled: true });
    await expect(listApps(env, actor)).resolves.toEqual([expect.objectContaining({ id: appId, keyCount: 1 })]);

    await revokeKey(env, actor, id);
    await expect(listApps(env, actor)).resolves.toEqual([expect.objectContaining({ id: appId, keyCount: 0 })]);
  });

  it("refuses a member key creation, and lets a member list apps", async () => {
    const { cookie, workspaceId } = await workspaceFor("apps-perm@example.com", "Apps Perm Co");
    const owner = await requireActor(env, headersFor(cookie), WRITE);
    const { id: appId } = await addApp(env, owner, { name: "Web", slug: "web" });
    const memberCookie = await addMember(workspaceId, "apps-member@example.com", "member");

    await expect(requireActor(env, headersFor(memberCookie), WRITE)).rejects.toMatchObject({ status: 403 });
    const memberActor = await requireActor(env, headersFor(memberCookie), READ);
    await expect(listApps(env, memberActor)).resolves.toEqual([
      expect.objectContaining({ id: appId, slug: "web", keyCount: 0 }),
    ]);
  });

  it("answers 404 for another workspace's key and leaves it working", async () => {
    const a = await workspaceFor("apps-a@example.com", "Apps A Co");
    const b = await workspaceFor("apps-b@example.com", "Apps B Co");
    const actorA = await requireActor(env, headersFor(a.cookie), WRITE);
    const actorB = await requireActor(env, headersFor(b.cookie), WRITE);
    const { id: appB } = await addApp(env, actorB, { name: "Web", slug: "web" });
    const bKey = await createKey(env, actorB, { appId: appB, name: "b" });

    await expect(revokeKey(env, actorA, bKey.id)).rejects.toMatchObject({ status: 404 });
    await expect(getApp(env, actorA, appB)).rejects.toMatchObject({ status: 404 });
    await expect(createKey(env, actorA, { appId: appB, name: "stolen" })).rejects.toMatchObject({ status: 404 });
    expect(await resolveApiKey(env, bKey.secret)).not.toBeNull();
  });

  it("fails a revoked key on the next resolve", async () => {
    const { cookie } = await workspaceFor("apps-revoke@example.com", "Apps Revoke Co");
    const actor = await requireActor(env, headersFor(cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    const key = await createKey(env, actor, { appId, name: "web" });
    expect(await resolveApiKey(env, key.secret)).not.toBeNull();

    await revokeKey(env, actor, key.id);
    expect(await resolveApiKey(env, key.secret)).toBeNull();
  });

  it("answers 409 for a duplicate slug and 400 for a bad slug", async () => {
    const { cookie } = await workspaceFor("apps-slug@example.com", "Apps Slug Co");
    const actor = await requireActor(env, headersFor(cookie), WRITE);
    await addApp(env, actor, { name: "Web", slug: "web" });

    await expect(addApp(env, actor, { name: "Again", slug: "web" })).rejects.toMatchObject({
      status: 409,
      message: "slug taken",
    });
    await expect(addApp(env, actor, { name: "Bad", slug: "Bad Slug" })).rejects.toMatchObject({ status: 400 });
  });

  it("renders the app page with the key name and never the secret", async () => {
    const { cookie } = await workspaceFor("apps-page@example.com", "Apps Page Co");
    const actor = await requireActor(env, headersFor(cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    const key = await createKey(env, actor, { appId, name: "Checkout key" });

    const res = await SELF.fetch(`${ORIGIN}/apps/${appId}`, { redirect: "manual", headers: { cookie } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Checkout key");
    expect(html).not.toContain(key.secret);
  });
});
