import { createExecutionContext, env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
  const [a] = await db.insert(app).values({ workspaceId: ws.id, name: "one", slug: "one" }).returning();
  const key = (await createApiKey(env, { workspaceId: ws.id, appId: a.id, name: "k" })).secret;
  await seedVerifiedSender(ws.id, a.id);
  return { rpc: new RelayRpc(createExecutionContext(), env), key };
}

const row = (ref: string, extra: Record<string, unknown> = {}) => ({
  importRef: ref,
  toEmail: "buyer@x.test",
  stream: "transactional",
  event: null,
  subject: `Order ${ref}`,
  status: "sent",
  error: null,
  createdAt: 1_700_000_000_000,
  sentAt: 1_700_000_001_000,
  sesMessageId: null,
  opens: 0,
  clicks: 0,
  deliveredAt: null,
  bouncedAt: null,
  complainedAt: null,
  ...extra,
});

describe("message history import", () => {
  let enqueue: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    enqueue = vi.spyOn(env.SEND, "send").mockResolvedValue(undefined as never);
  });

  it("creates rows once and reports repeats as existing", async () => {
    const { rpc, key } = await seed("imp-msg-repeat");
    expect(await rpc.importMessages(key, [row("o1"), row("o2")])).toEqual({ created: 2, existing: 0 });
    expect(await rpc.importMessages(key, [row("o1"), row("o2")])).toEqual({ created: 0, existing: 2 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("blocks a later send with an imported key as a duplicate and queues nothing", async () => {
    const { rpc, key } = await seed("imp-msg-send");
    await rpc.importMessages(key, [row("o9")]);
    const [imported] = await rpc.messagesByKeys(key, ["o9"]);
    const sent = await rpc.send(key, { stream: "transactional", from: "Relay@A6n.ai", to: "buyer@x.test", subject: "S", html: "<p>x</p>", text: "x", idempotencyKey: "o9" });
    expect(sent).toEqual({ messageId: imported.messageId, status: "sent", duplicate: true });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("returns imported delivery and bounce events through messagesByKeys", async () => {
    const { rpc, key } = await seed("imp-msg-events");
    await rpc.importMessages(key, [row("o5", { status: "sent", deliveredAt: 1_700_000_002_000, bouncedAt: 1_700_000_003_000, opens: 3 })]);
    const [found] = await rpc.messagesByKeys(key, ["o5"]);
    expect(found).toMatchObject({ key: "o5", status: "sent", sentAt: 1_700_000_001_000, deliveredAt: 1_700_000_002_000, bouncedAt: 1_700_000_003_000, complainedAt: null, opens: 3 });
  });

  it("refuses a line break in the subject and more than 500 rows", async () => {
    const { rpc, key } = await seed("imp-msg-bad");
    await expect(rpc.importMessages(key, [row("o6", { subject: "a\nb" })])).rejects.toThrow();
    const many = Array.from({ length: 501 }, (_, i) => row(`m${i}`));
    await expect(rpc.importMessages(key, many)).rejects.toThrow();
  });
});
