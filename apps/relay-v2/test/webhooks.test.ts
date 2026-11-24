import { env, runInDurableObject, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApiKey } from "../src/core/api-keys";
import { securityDb } from "../src/db/security/client";
import { app, member, user, workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

async function seedWorkspace(slug: string, apps: string[]) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [owner] = await db.insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
  await db.insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
  const appIds: string[] = [];
  for (const appSlug of apps) {
    const [a] = await db.insert(app).values({ workspaceId: ws.id, name: appSlug, slug: appSlug }).returning();
    appIds.push(a.id);
  }
  return { workspaceId: ws.id, appIds };
}

async function keyFor(workspaceId: string, appId: string) {
  return (await createApiKey(env, { workspaceId, appId, name: "test" })).secret;
}

const url = "https://tg.example/api/webhooks/relay";
const request = (method: string, path: string, secret?: string, body?: unknown) =>
  SELF.fetch(`https://relay.test/api/v1/webhooks${path}`, {
    method,
    headers: {
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("webhooks API", () => {
  it("creates a webhook with the given secret and stores it encrypted", async () => {
    const { workspaceId, appIds } = await seedWorkspace("hook-create", ["main"]);
    const key = await keyFor(workspaceId, appIds[0]);
    const secret = "s".repeat(32);

    const res = await request("POST", "", key, { url, events: ["mailbox.received"], secret });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { webhook: Record<string, unknown>; secret: string };
    expect(created.secret).toBe(secret);
    expect(created.webhook).toEqual({
      id: expect.stringMatching(/^whk_/),
      appId: appIds[0],
      url,
      events: ["mailbox.received"],
      enabled: true,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });

    const stub = env.CLIENT.get(env.CLIENT.idFromName(workspaceId));
    const stored = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql
        .exec<{ secret_enc: string }>("SELECT secret_enc FROM webhook WHERE id = ?", (created.webhook as { id: string }).id)
        .toArray()[0].secret_enc,
    );
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain(secret);
  });

  it("lists webhooks without any secret field", async () => {
    const { workspaceId, appIds } = await seedWorkspace("hook-list", ["main"]);
    const key = await keyFor(workspaceId, appIds[0]);
    await request("POST", "", key, { url, events: ["mailbox.received"], secret: "l".repeat(32) });

    const res = await request("GET", "", key);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown>[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).not.toHaveProperty("secret");
    expect(body.data[0]).not.toHaveProperty("secretEnc");
    expect(JSON.stringify(body)).not.toContain("l".repeat(32));
  });

  it("generates a 64-char hex secret when none is given", async () => {
    const { workspaceId, appIds } = await seedWorkspace("hook-gen", ["main"]);
    const key = await keyFor(workspaceId, appIds[0]);

    const res = await request("POST", "", key, { url, events: ["mailbox.received"] });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { secret: string }).secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an http url, empty events and an unknown event with 400", async () => {
    const { workspaceId, appIds } = await seedWorkspace("hook-invalid", ["main"]);
    const key = await keyFor(workspaceId, appIds[0]);

    for (const body of [
      { url: "http://x.test", events: ["mailbox.received"] },
      { url, events: [] },
      { url, events: ["message.sent"] },
    ]) {
      const res = await request("POST", "", key, body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid input" });
    }
  });

  it("patches enabled, then deletes once and 404s on the second delete", async () => {
    const { workspaceId, appIds } = await seedWorkspace("hook-patch", ["main"]);
    const key = await keyFor(workspaceId, appIds[0]);
    const created = (await (await request("POST", "", key, { url, events: ["mailbox.received"] })).json()) as {
      webhook: { id: string };
    };
    const path = `/${created.webhook.id}`;

    const patched = await request("PATCH", path, key, { enabled: false });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ id: created.webhook.id, enabled: false });

    expect((await request("DELETE", path, key)).status).toBe(204);
    expect((await request("DELETE", path, key)).status).toBe(404);
  });

  it("hides another app's and another workspace's webhooks as missing", async () => {
    const a = await seedWorkspace("hook-iso-a", ["main", "other"]);
    const c = await seedWorkspace("hook-iso-c", ["main"]);
    const keyA = await keyFor(a.workspaceId, a.appIds[0]);
    const keyB = await keyFor(a.workspaceId, a.appIds[1]);
    const keyC = await keyFor(c.workspaceId, c.appIds[0]);
    const created = (await (await request("POST", "", keyA, { url, events: ["mailbox.received"] })).json()) as {
      webhook: { id: string };
    };
    const path = `/${created.webhook.id}`;

    for (const key of [keyB, keyC]) {
      expect((await request("PATCH", path, key, { enabled: false })).status).toBe(404);
      expect((await request("DELETE", path, key)).status).toBe(404);
      expect(await (await request("GET", "", key)).json()).toEqual({ data: [] });
    }
    expect(await (await request("GET", "", keyA)).json()).toMatchObject({ data: [{ id: created.webhook.id }] });
  });

  it("returns 401 without a key", async () => {
    expect((await request("GET", "")).status).toBe(401);
    expect((await request("POST", "", undefined, { url, events: ["mailbox.received"] })).status).toBe(401);
  });
});
