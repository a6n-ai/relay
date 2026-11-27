import { createExecutionContext, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApiKey } from "../src/services/api-keys";
import { securityDb } from "../src/db/security/client";
import { app, member, user, workspace } from "../src/db/security/schema";
import { RelayRpc } from "../src/rpc/relay-rpc";
import { applyMigrations, seedVerifiedSender } from "./migrate";


beforeAll(async () => {
  await applyMigrations();
});

const message = {
  stream: "transactional",
  from: "relay@a6n.ai",
  to: "guest@x.com",
  subject: "Order 1",
  html: "<p>Thanks</p>",
  text: "Thanks",
};

async function tenant(slug: string) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [a] = await db.insert(app).values({ workspaceId: ws.id, name: slug, slug: "main" }).returning();
  const [owner] = await db.insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
  await db.insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
  const { secret } = await createApiKey(env, { workspaceId: ws.id, appId: a.id, name: "web" });
  return { workspaceId: ws.id, appId: a.id, secret };
}

const post = (secret: string, body: unknown) =>
  SELF.fetch("https://relay.test/api/v1/messages", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const get = (secret: string, id: string) =>
  SELF.fetch(`https://relay.test/api/v1/messages/${id}`, { headers: { authorization: `Bearer ${secret}` } });

describe("tenant isolation", () => {
  it("cannot read a message sent by another workspace's key", async () => {
    const a = await tenant("iso-a");
    const b = await tenant("iso-b");
    await seedVerifiedSender(a.workspaceId, a.appId);

    const sent = await post(a.secret, message);
    expect(sent.status).toBe(202);
    const { messageId } = await sent.json<{ messageId: string }>();

    expect((await get(a.secret, messageId)).status).toBe(200);
    expect((await get(b.secret, messageId)).status).toBe(404);
    expect((await post("rk_bogus", message)).status).toBe(401);

    const rpc = new RelayRpc(createExecutionContext(), env);
    expect(await rpc.getMessage(b.secret, messageId)).toBeNull();
  });

  // Review Focus 4: a body that names another workspace is ignored.
  it("stores a message in the key's workspace and app, whatever the body names", async () => {
    const a = await tenant("body-a");
    const b = await tenant("body-b");
    await seedVerifiedSender(a.workspaceId, a.appId);

    const sent = await post(a.secret, { ...message, workspaceId: b.workspaceId, appId: b.appId });
    expect(sent.status).toBe(202);
    const { messageId } = await sent.json<{ messageId: string }>();

    const view = await (await get(a.secret, messageId)).json<{ appId: string }>();
    expect(view.appId).toBe(a.appId);
    expect((await get(b.secret, messageId)).status).toBe(404);
  });
});
