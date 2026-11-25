import { createExecutionContext, env, runInDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApiKey } from "../src/core/api-keys";
import { securityDb } from "../src/db/security/client";
import { app, member, user, workspace } from "../src/db/security/schema";
import { RelayRpc } from "../src/rpc/relay-rpc";
import { applyMigrations, seedVerifiedSender } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

async function seed(slug: string) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [owner] = await db.insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
  await db.insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
  const [app1] = await db.insert(app).values({ workspaceId: ws.id, name: "one", slug: "one" }).returning();
  const [app2] = await db.insert(app).values({ workspaceId: ws.id, name: "two", slug: "two" }).returning();
  const key1 = (await createApiKey(env, { workspaceId: ws.id, appId: app1.id, name: "k1" })).secret;
  const key2 = (await createApiKey(env, { workspaceId: ws.id, appId: app2.id, name: "k2" })).secret;
  await seedVerifiedSender(ws.id, app1.id);
  await seedVerifiedSender(ws.id, app2.id);
  return { rpc: new RelayRpc(createExecutionContext(), env), key1, key2, workspaceId: ws.id };
}

const mail = { stream: "transactional", from: "Relay@A6n.ai", to: "a@x.com", subject: "Hi", html: "<p>x</p>", text: "x" } as const;

describe("RelayRpc lookups", () => {
  it("returns only the app's own message for a key", async () => {
    const { rpc, key1, key2 } = await seed("lookup-keys");
    const sent = await rpc.send(key1, { ...mail, idempotencyKey: "order-1" });
    const other = await rpc.send(key2, { ...mail, idempotencyKey: "order-1" });
    expect(other.messageId).not.toBe(sent.messageId);
    const mine = await rpc.messagesByKeys(key1, ["order-1", "order-missing"]);
    expect(mine).toEqual([expect.objectContaining({ key: "order-1", messageId: sent.messageId, status: "queued", sentAt: null, opens: 0 })]);
    expect(await rpc.messagesByKeys(key1, ["order-missing"])).toEqual([]);
  });

  it("returns suppressed emails only", async () => {
    const { rpc, key1 } = await seed("lookup-suppression");
    await rpc.suppress(key1, { email: "Gone@X.test", reason: "unsubscribe", stream: null });
    const rows = await rpc.suppressionStatus(key1, ["gone@x.test", "clean@x.test"]);
    expect(rows).toEqual([{ email: "gone@x.test", stream: null, reason: "unsubscribe", brandOptOut: false }]);
  });

  it("flags a brand opt-out only for the sending domain given as from", async () => {
    const { rpc, key1, workspaceId } = await seed("lookup-brand");
    await rpc.suppress(key1, { email: "gone@x.test", reason: "unsubscribe", stream: null });
    await runInDurableObject(env.CLIENT.get(env.CLIENT.idFromName(workspaceId)), (_i, state) =>
      state.storage.sql.exec("INSERT INTO marketing_optout (email, domain, created_at) VALUES (?, ?, ?)", "gone@x.test", "x.test", Date.now()),
    );
    expect(await rpc.suppressionStatus(key1, ["gone@x.test"], "Relay@X.test")).toEqual([
      { email: "gone@x.test", stream: null, reason: "unsubscribe", brandOptOut: true },
    ]);
    expect(await rpc.suppressionStatus(key1, ["gone@x.test"], "Relay@other.test")).toEqual([
      { email: "gone@x.test", stream: null, reason: "unsubscribe", brandOptOut: false },
    ]);
    expect(await rpc.suppressionStatus(key1, ["gone@x.test"])).toEqual([
      { email: "gone@x.test", stream: null, reason: "unsubscribe", brandOptOut: false },
    ]);
  });

  it("suppresses idempotently and records created", async () => {
    const { rpc, key1 } = await seed("lookup-suppress-twice");
    expect(await rpc.suppress(key1, { email: "a@x.test", reason: "manual", stream: "marketing" })).toEqual({ created: true });
    expect(await rpc.suppress(key1, { email: "a@x.test", reason: "manual", stream: "marketing" })).toEqual({ created: false });
  });

  it("refuses more than 100 keys as invalid input", async () => {
    const { rpc, key1 } = await seed("lookup-cap");
    const keys = Array.from({ length: 101 }, (_, i) => `k${i}`);
    await expect(rpc.messagesByKeys(key1, keys)).rejects.toThrow("invalid input");
  });
});
