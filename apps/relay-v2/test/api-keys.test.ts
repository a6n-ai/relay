import { createExecutionContext, env, runInDurableObject, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createApiKey, resolveApiKey, revokeApiKey } from "../src/core/api-keys";
import { ensureWorkspaceProfile } from "../src/core/workspace-profile";
import { coreDb } from "../src/db/core/client";
import { address, sendingDomain } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { app, member, user, workspace } from "../src/db/security/schema";
import { RelayRpc } from "../src/rpc/relay-rpc";
import { applyMigrations } from "./migrate";


beforeAll(async () => {
  await applyMigrations();
});

async function seedApp(slug: string) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [a] = await db.insert(app).values({ workspaceId: ws.id, name: slug, slug: "main" }).returning();
  const [owner] = await db.insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
  await db.insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
  return { workspaceId: ws.id, appId: a.id };
}

const sendBody = JSON.stringify({ to: "a@x.com", subject: "hi", text: "hi" });
const post = (secret: string) =>
  SELF.fetch("https://relay.test/api/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: sendBody,
  });

describe("API keys", () => {
  it("resolves a created key to its workspace and app", async () => {
    const { workspaceId, appId } = await seedApp("keys-resolve");
    const { id, secret } = await createApiKey(env, { workspaceId, appId, name: "web" });

    expect(secret).toMatch(/^rk_[A-Za-z]{64}$/);
    expect(await resolveApiKey(env, secret)).toEqual({ workspaceId, appId, keyId: id });
  });

  it("resolves a wrong secret to null", async () => {
    const { workspaceId, appId } = await seedApp("keys-wrong");
    await createApiKey(env, { workspaceId, appId, name: "web" });

    expect(await resolveApiKey(env, "rk_not-a-real-secret-0000000000000000")).toBeNull();
  });

  it("stores the key owned by the workspace with the app in metadata, never the secret", async () => {
    const { workspaceId, appId } = await seedApp("keys-hash");
    const { secret } = await createApiKey(env, { workspaceId, appId, name: "web" });

    const rows = await env.SECURITY_DB.prepare("SELECT * FROM apikey").all();
    const stored = JSON.stringify(rows.results);
    expect(stored).not.toContain(secret);
    expect(stored).not.toContain(secret.slice(3));
    expect(rows.results.find((r) => r.reference_id === workspaceId)).toMatchObject({
      prefix: "rk_",
      metadata: JSON.stringify({ appId }),
    });
  });

  it("refuses to bind a key to an app in another workspace", async () => {
    const a = await seedApp("keys-mismatch-a");
    const b = await seedApp("keys-mismatch-b");

    await expect(
      createApiKey(env, { workspaceId: a.workspaceId, appId: b.appId, name: "web" }),
    ).rejects.toThrow("app does not belong to workspace");
    const rows = await env.SECURITY_DB.prepare("SELECT COUNT(*) AS n FROM apikey WHERE json_extract(metadata, '$.appId') = ?")
      .bind(b.appId)
      .first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("refuses the key of a suspended workspace and accepts it again once reinstated", async () => {
    const { workspaceId, appId } = await seedApp("keys-suspend");
    const { secret } = await createApiKey(env, { workspaceId, appId, name: "web" });

    await securityDb(env).update(workspace).set({ status: "suspended" }).where(eq(workspace.id, workspaceId));
    expect(await resolveApiKey(env, secret)).toBeNull();
    const rpc = new RelayRpc(createExecutionContext(), env);
    await expect(rpc.send(secret, {})).rejects.toThrow("unauthorized");

    await securityDb(env).update(workspace).set({ status: "active" }).where(eq(workspace.id, workspaceId));
    expect(await resolveApiKey(env, secret)).not.toBeNull();
  });

  // Review Focus 3: a revoked key fails on the next call; there is no cache to survive in.
  it("fails a revoked key on the next call", async () => {
    const { workspaceId, appId } = await seedApp("keys-revoke");
    const { id, secret } = await createApiKey(env, { workspaceId, appId, name: "web" });

    expect(await resolveApiKey(env, secret)).not.toBeNull();
    await revokeApiKey(env, workspaceId, id);

    expect(await resolveApiKey(env, secret)).toBeNull();
    const rpc = new RelayRpc(createExecutionContext(), env);
    await expect(rpc.send(secret, {})).rejects.toThrow("unauthorized");
  });

  it("answers 429 on HTTP and throws rate limited over RPC once a key is over API_LIMIT", async () => {
    const { workspaceId, appId } = await seedApp("keys-limit");
    const { id, secret } = await createApiKey(env, { workspaceId, appId, name: "web" });

    // The limiter window is a fixed 60 s, so spend the budget right before each call; otherwise a window rollover between spend and call makes this flaky.
    const exhaust = () => env.API_LIMIT.limit({ key: id, delta: 600 });

    await exhaust();
    const res = await post(secret);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate limited" });
    const rpc = new RelayRpc(createExecutionContext(), env);
    await exhaust();
    await expect(rpc.send(secret, {})).rejects.toThrow("rate limited");
  });

  it("does not let HTTP create keys, so metadata.appId stays server-set", async () => {
    const { workspaceId, appId } = await seedApp("keys-http");
    const res = await SELF.fetch("https://relay.test/api/auth/api-key/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "evil", organizationId: workspaceId, metadata: { appId } }),
    });

    expect(res.status).toBe(404);
    const rows = await env.SECURITY_DB.prepare("SELECT COUNT(*) AS n FROM apikey WHERE reference_id = ?").bind(workspaceId).first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it("ignores campaignId on an API send: the mail queues as a normal send and no campaign counter moves", async () => {
    const { workspaceId, appId } = await seedApp("keys-campaign");
    const { secret } = await createApiKey(env, { workspaceId, appId, name: "web" });
    const from = "relay@keys-campaign.test";
    await coreDb(env).insert(sendingDomain).values({ workspaceId, domain: "keys-campaign.test", sesRegion: "ap-south-1", status: "verified" });
    await coreDb(env).insert(address).values({ workspaceId, appId, email: from, kind: "sender", canSend: true });
    await ensureWorkspaceProfile(env, workspaceId);
    const stub = env.CLIENT.get(env.CLIENT.idFromName(workspaceId));
    const campaign = await stub.createCampaign(workspaceId, appId, "C");
    const enqueue = vi.spyOn(env.SEND, "send").mockResolvedValue(undefined as never);

    const res = await SELF.fetch("https://relay.test/api/v1/messages", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ stream: "transactional", from, to: "a@x.com", subject: "hi", html: "<p>hi</p>", text: "hi", campaignId: campaign.id }),
    });

    expect(res.status).toBe(202);
    const { messageId } = await res.json<{ messageId: string }>();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(await stub.getMessage(workspaceId, messageId)).toMatchObject({ status: "queued" });
    const linked = await runInDurableObject(stub, (_i, state) =>
      state.storage.sql.exec<{ campaign_id: string | null }>("SELECT campaign_id FROM message WHERE id = ?", messageId).toArray(),
    );
    expect(linked).toEqual([{ campaign_id: null }]);
    expect(await stub.campaignStats(workspaceId, campaign.id)).toMatchObject({ queued: 0, failed: 0, sent: 0 });
    vi.restoreAllMocks();
  });
});
