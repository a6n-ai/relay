import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiKey } from "../src/core/api-keys";
import { securityDb } from "../src/db/security/client";
import { app, member, user, workspace } from "../src/db/security/schema";
import type { RelayRpc } from "../src/rpc/relay-rpc";
import { applyMigrations } from "./migrate";

const limit = vi.hoisted(() => ({ allow: true }));
vi.mock("../src/core/api-keys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/core/api-keys")>()),
  withinRateLimit: async () => limit.allow,
}));

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(() => {
  limit.allow = true;
});

// The loopback entrypoint goes through the runtime like a service binding, so a refusal that left work pending
// would surface here as a hung-request error instead of the refusal.
const rpc = (exports as unknown as { RelayRpc: Pick<RelayRpc, "send" | "sendTemplate" | "createTemplate"> }).RelayRpc;

async function keyWithoutDefaultSender(slug: string) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [owner] = await db.insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
  await db.insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
  const [a] = await db.insert(app).values({ workspaceId: ws.id, name: slug, slug: "main" }).returning();
  return (await createApiKey(env, { workspaceId: ws.id, appId: a.id, name: "k" })).secret;
}

const mail = { stream: "transactional", to: "a@x.test", subject: "Hi", html: "<p>x</p>", text: "x" } as const;
const reason = (p: Promise<unknown>) => p.then(() => "resolved", (e: Error) => e.message);

describe("RelayRpc refusals over the runtime", () => {
  it("refuses a send with no default sender as no_default_sender", async () => {
    const key = await keyWithoutDefaultSender("rpc-no-default");
    expect(await reason(rpc.send(key, mail))).toBe("no_default_sender");
  });

  it("refuses a template send with no default sender as no_default_sender", async () => {
    const key = await keyWithoutDefaultSender("rpc-no-default-tpl");
    const tpl = await rpc.createTemplate(key, { name: "T", subject: "S", html: "<p>x</p>", text: "x" });
    expect(await reason(rpc.sendTemplate(key, { stream: "transactional", to: "a@x.test", templateId: tpl.id }))).toBe("no_default_sender");
  });

  it("refuses an unknown key as unauthorized", async () => {
    expect(await reason(rpc.send("rk_unknown", mail))).toBe("unauthorized");
  });

  it("refuses a key over its rate limit as rate limited", async () => {
    const key = await keyWithoutDefaultSender("rpc-limited");
    limit.allow = false;
    expect(await reason(rpc.send(key, mail))).toBe("rate limited");
  });
});
