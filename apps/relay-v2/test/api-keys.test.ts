import { applyD1Migrations, createExecutionContext, env, type D1Migration } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApiKey, resolveApiKey, revokeApiKey } from "../src/core/api-keys";
import { centralDb } from "../src/db/central/client";
import { app, workspace } from "../src/db/central/schema";
import { RelayRpc } from "../src/rpc/relay-rpc";

const { TEST_MIGRATIONS } = env as typeof env & { TEST_MIGRATIONS: D1Migration[] };

beforeAll(async () => {
  await applyD1Migrations(env.CENTRAL, TEST_MIGRATIONS);
});

async function seedApp(slug: string) {
  const db = centralDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [a] = await db.insert(app).values({ workspaceId: ws.id, name: slug, slug: "main" }).returning();
  return { workspaceId: ws.id, appId: a.id };
}

describe("API keys", () => {
  it("resolves a created key to its workspace and app", async () => {
    const { workspaceId, appId } = await seedApp("keys-resolve");
    const { id, secret } = await createApiKey(env, { workspaceId, appId, name: "web" });

    expect(secret).toMatch(/^rk_[A-Za-z0-9_-]{32}$/);
    expect(await resolveApiKey(env, secret)).toEqual({ workspaceId, appId, keyId: id });
  });

  it("resolves a wrong secret to null", async () => {
    const { workspaceId, appId } = await seedApp("keys-wrong");
    await createApiKey(env, { workspaceId, appId, name: "web" });

    expect(await resolveApiKey(env, "rk_not-a-real-secret-0000000000000000")).toBeNull();
  });

  it("stores only the hash and the prefix, never the secret", async () => {
    const { workspaceId, appId } = await seedApp("keys-hash");
    const { secret } = await createApiKey(env, { workspaceId, appId, name: "web" });

    const rows = await env.CENTRAL.prepare("SELECT * FROM api_key").all();
    const stored = JSON.stringify(rows.results);
    expect(stored).not.toContain(secret);
    expect(stored).not.toContain(secret.slice(3));
    expect(rows.results.find((r) => r.prefix === secret.slice(0, 8))).toMatchObject({
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("refuses to bind a key to an app in another workspace", async () => {
    const a = await seedApp("keys-mismatch-a");
    const b = await seedApp("keys-mismatch-b");

    await expect(
      createApiKey(env, { workspaceId: a.workspaceId, appId: b.appId, name: "web" }),
    ).rejects.toThrow("app does not belong to workspace");
    const rows = await env.CENTRAL.prepare("SELECT COUNT(*) AS n FROM api_key WHERE app_id = ?").bind(b.appId).first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  // Review Focus 3: a revoked key must not survive in the cache.
  it("fails a revoked key on the next call, even after it was cached", async () => {
    const { workspaceId, appId } = await seedApp("keys-revoke");
    const { id, secret } = await createApiKey(env, { workspaceId, appId, name: "web" });

    expect(await resolveApiKey(env, secret)).not.toBeNull();
    await revokeApiKey(env, id);

    expect(await resolveApiKey(env, secret)).toBeNull();
    const rpc = new RelayRpc(createExecutionContext(), env);
    await expect(rpc.send(secret, {})).rejects.toThrow("unauthorized");
  });
});
