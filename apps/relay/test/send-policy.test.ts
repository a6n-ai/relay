import { LIMITS_KEY, LIMITS_TTL_MS, SENDER_RETRY_MS } from "../src/core/limits";
import { env, runInDurableObject, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiKey } from "../src/services/api-keys";
import { coreDb } from "../src/db/core/client";
import { address, sendingDomain, workspaceProfile } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { app, member, user, workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(() => {
  vi.spyOn(env.SEND, "send").mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const from = "orders@tiffingrab.ca";
const base = {
  appId: "app_1",
  stream: "transactional" as const,
  from,
  to: "guest@x.com",
  subject: "Order 1",
  html: "<p>Thanks</p>",
  text: "Thanks",
};

const stubFor = (workspaceId: string) => env.CLIENT.get(env.CLIENT.idFromName(workspaceId));

async function seedWorkspace(workspaceId: string, quota?: number) {
  await securityDb(env).insert(workspace).values({ id: workspaceId, name: workspaceId, slug: workspaceId });
  if (quota !== undefined) await coreDb(env).insert(workspaceProfile).values({ workspaceId, monthlyMessageQuota: quota });
}

async function seedSender(
  workspaceId: string,
  domain: string,
  email: string,
  opts: { status?: "pending" | "verified"; sesRegion?: string; name?: string; appId?: string } = {},
) {
  // Storage persists across tests in this file and domain and email are unique: a re-seed moves ownership.
  const sesRegion = opts.sesRegion ?? "us-east-1";
  const status = opts.status ?? "verified";
  await coreDb(env)
    .insert(sendingDomain)
    .values({ workspaceId, domain, sesRegion, status })
    .onConflictDoUpdate({ target: sendingDomain.domain, set: { workspaceId, sesRegion, status } });
  const displayName = opts.name ?? null;
  await coreDb(env)
    .insert(address)
    .values({ workspaceId, appId: opts.appId ?? "app_1", email, kind: "sender", displayName, canSend: true })
    .onConflictDoUpdate({ target: address.email, set: { workspaceId, appId: opts.appId ?? "app_1", displayName, canSend: true } });
}

// RPC rejections surface as unhandled in this plugin, so the refused calls run inside the DO.
const refusal = (stub: ReturnType<typeof stubFor>, workspaceId: string, input: typeof base) =>
  runInDurableObject(stub, (instance) =>
    instance.send(workspaceId, input).then(() => "resolved", (e: Error) => e.message),
  );

const rowCount = (stub: ReturnType<typeof stubFor>) =>
  runInDurableObject(stub, (_instance, state) =>
    state.storage.sql.exec<{ n: number }>("SELECT count(*) AS n FROM message").toArray()[0].n,
  );

describe("send policy", () => {
  it("queues from a verified sender with its region and display name", async () => {
    await seedWorkspace("wsp_p");
    await seedSender("wsp_p", "tiffingrab.ca", from, { sesRegion: "us-east-1", name: "TiffinGrab" });
    const stub = stubFor("wsp_p");

    const sent = await stub.send("wsp_p", base);
    expect(sent.status).toBe("queued");
    expect(await stub.getMessage("wsp_p", sent.messageId)).toMatchObject({ sesRegion: "us-east-1", fromName: "TiffinGrab" });
  });

  it("accepts a from with different case and spaces", async () => {
    await seedWorkspace("wsp_case");
    await seedSender("wsp_case", "tiffingrab.ca", from);

    const sent = await stubFor("wsp_case").send("wsp_case", { ...base, from: " Orders@TiffinGrab.ca " });
    expect(sent.status).toBe("queued");
  });

  it("personal mailbox is not a sender", async () => {
    await seedWorkspace("wsp_pers");
    await seedSender("wsp_pers", "pers.ca", "ops@pers.ca");
    await coreDb(env)
      .insert(address)
      .values({ workspaceId: "wsp_pers", appId: "app_1", email: "ravi@pers.ca", kind: "personal", ownerUserId: "usr_ravi", canSend: true });
    expect(await refusal(stubFor("wsp_pers"), "wsp_pers", { ...base, from: "ravi@pers.ca" })).toBe("sender_not_verified");
  });

  it("refuses another workspace's address and an address on a pending domain", async () => {
    await seedWorkspace("wsp_q");
    await seedSender("wsp_q", "other.ca", "ops@other.ca");
    await seedWorkspace("wsp_pend");
    await seedSender("wsp_pend", "pending.ca", "hi@pending.ca", { status: "pending" });
    const stub = stubFor("wsp_pend");

    expect(await refusal(stub, "wsp_pend", { ...base, from: "ops@other.ca" })).toBe("sender_not_verified");
    expect(await refusal(stub, "wsp_pend", { ...base, from: "hi@pending.ca" })).toBe("sender_not_verified");
    expect(await rowCount(stub)).toBe(0);
  });

  it("counts queued sends against the monthly quota, skips suppressed ones and honours idempotency", async () => {
    await seedWorkspace("wsp_quota", 2);
    await seedSender("wsp_quota", "tiffingrab.ca", from);
    const stub = stubFor("wsp_quota");
    await stub.addSuppression("wsp_quota", "blocked@x.com", "unsubscribe");

    const suppressed = await stub.send("wsp_quota", { ...base, to: "blocked@x.com" });
    const first = await stub.send("wsp_quota", { ...base, idempotencyKey: "k1" });
    const second = await stub.send("wsp_quota", base);
    expect([suppressed.status, first.status, second.status]).toEqual(["suppressed", "queued", "queued"]);

    expect(await refusal(stub, "wsp_quota", base)).toBe("quota_exceeded");
    expect(await stub.send("wsp_quota", { ...base, idempotencyKey: "k1" })).toEqual({
      messageId: first.messageId,
      status: "queued",
      duplicate: true,
    });
  });

  it("does not count inbound rows toward the monthly quota", async () => {
    await seedWorkspace("wsp_inq", 2);
    await seedSender("wsp_inq", "tiffingrab.ca", from);
    const stub = stubFor("wsp_inq");
    const now = Date.now();
    await runInDurableObject(stub, (_instance, state) => {
      for (const id of ["msg_in_a", "msg_in_b"])
        state.storage.sql.exec(
          "INSERT INTO message (id, app_id, direction, stream, status, created_at, updated_at) VALUES (?, 'app_1', 'in', 'transactional', 'sent', ?, ?)",
          id, now, now,
        );
    });

    expect((await stub.send("wsp_inq", base)).status).toBe("queued");
    expect((await stub.send("wsp_inq", base)).status).toBe("queued");
    expect(await refusal(stub, "wsp_inq", base)).toBe("quota_exceeded");
  });

  it("counts outbound sent rows toward the monthly quota", async () => {
    await seedWorkspace("wsp_outq", 2);
    await seedSender("wsp_outq", "tiffingrab.ca", from);
    const stub = stubFor("wsp_outq");
    const now = Date.now();
    await runInDurableObject(stub, (_instance, state) => {
      for (const id of ["msg_out_a", "msg_out_b"])
        state.storage.sql.exec(
          "INSERT INTO message (id, app_id, direction, stream, status, from_email, created_at, updated_at) VALUES (?, 'app_1', 'out', 'transactional', 'sent', ?, ?, ?)",
          id, from, now, now,
        );
    });

    expect(await refusal(stub, "wsp_outq", base)).toBe("quota_exceeded");
  });

  it("does not count last month's rows toward the quota", async () => {
    await seedWorkspace("wsp_prev", 1);
    await seedSender("wsp_prev", "tiffingrab.ca", from);
    const stub = stubFor("wsp_prev");
    const now = new Date();
    const lastMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1;
    await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec(
        "INSERT INTO message (id, app_id, direction, stream, status, created_at, updated_at) VALUES ('msg_prev', 'app_1', 'out', 'transactional', 'queued', ?, ?)",
        lastMonth,
        lastMonth,
      ),
    );

    expect((await stub.send("wsp_prev", base)).status).toBe("queued");
    expect(await refusal(stub, "wsp_prev", base)).toBe("quota_exceeded");
  });

  it("treats quota 0 as unlimited", async () => {
    await seedWorkspace("wsp_unl", 0);
    await seedSender("wsp_unl", "tiffingrab.ca", from);
    const stub = stubFor("wsp_unl");

    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await stub.send("wsp_unl", base)).status);
    expect(statuses).toEqual(["queued", "queued", "queued"]);
  });

  it("refuses sends once the workspace is suspended and a refresh has run, writing no row", async () => {
    await seedWorkspace("wsp_susp");
    await seedSender("wsp_susp", "tiffingrab.ca", from);
    const stub = stubFor("wsp_susp");
    await stub.send("wsp_susp", base);

    await securityDb(env).update(workspace).set({ status: "suspended" }).where(eq(workspace.id, "wsp_susp"));
    await stub.refreshLimits("wsp_susp");

    expect(await refusal(stub, "wsp_susp", base)).toBe("workspace_suspended");
    expect(await rowCount(stub)).toBe(1);
  });

  it("picks up a sender added after the first load once the cache is older than 60 s", async () => {
    await seedWorkspace("wsp_late");
    await seedSender("wsp_late", "tiffingrab.ca", from);
    const stub = stubFor("wsp_late");
    await stub.send("wsp_late", base);

    await seedSender("wsp_late", "later.ca", "hello@later.ca");
    expect(await refusal(stub, "wsp_late", { ...base, from: "hello@later.ca" })).toBe("sender_not_verified");

    await runInDurableObject(stub, (_instance, state) => {
      const snapshot = state.storage.kv.get<{ fetchedAt: number }>(LIMITS_KEY)!;
      state.storage.kv.put(LIMITS_KEY, { ...snapshot, fetchedAt: Date.now() - SENDER_RETRY_MS - 1_000 });
    });
    expect((await stub.send("wsp_late", { ...base, from: "hello@later.ca" })).status).toBe("queued");
  });

  // Review Focus 4: central D1 down when the cache expires.
  it("keeps sending on the stale snapshot when D1 is down, and refuses a DO that never loaded limits", async () => {
    await seedWorkspace("wsp_stale");
    await seedSender("wsp_stale", "tiffingrab.ca", from);
    await seedWorkspace("wsp_cold");
    await seedSender("wsp_cold", "cold.ca", "cold@cold.ca");
    const stale = stubFor("wsp_stale");
    await stale.send("wsp_stale", base);
    await runInDurableObject(stale, (_instance, state) => {
      const snapshot = state.storage.kv.get<{ fetchedAt: number }>(LIMITS_KEY)!;
      state.storage.kv.put(LIMITS_KEY, { ...snapshot, fetchedAt: Date.now() - LIMITS_TTL_MS - 1_000 });
    });

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(env.CORE_DB, "prepare").mockImplementation(() => {
      throw new Error("D1 down");
    });

    expect((await stale.send("wsp_stale", base)).status).toBe("queued");
    expect(await refusal(stubFor("wsp_cold"), "wsp_cold", { ...base, from: "cold@cold.ca" })).toBe("limits unavailable");
  });

  it("maps refusals to HTTP status codes", async () => {
    const slug = "http-policy";
    const [ws] = await securityDb(env).insert(workspace).values({ name: slug, slug }).returning();
    const [a] = await securityDb(env).insert(app).values({ workspaceId: ws.id, name: slug, slug: "main" }).returning();
    const [owner] = await securityDb(env).insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
    await securityDb(env).insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
    const { secret } = await createApiKey(env, { workspaceId: ws.id, appId: a.id, name: "web" });
    await coreDb(env).insert(workspaceProfile).values({ workspaceId: ws.id, monthlyMessageQuota: 1 });
    await seedSender(ws.id, "tiffingrab.ca", from, { appId: a.id });
    const body = { stream: "transactional", from, to: "guest@x.com", subject: "Order 1", html: "<p>Thanks</p>", text: "Thanks" };
    const post = (payload: unknown) =>
      SELF.fetch("https://relay.test/api/v1/messages", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

    expect((await post(body)).status).toBe(202);
    const over = await post(body);
    expect(over.status).toBe(429);
    expect(await over.json()).toEqual({ error: "quota_exceeded" });
    const unverified = await post({ ...body, from: "stranger@tiffingrab.ca" });
    expect(unverified.status).toBe(422);
    expect(await unverified.json()).toEqual({ error: "sender_not_verified" });
  });

  it("refuses a subject with a line break at the API, queuing nothing", async () => {
    const slug = "http-crlf";
    const [ws] = await securityDb(env).insert(workspace).values({ name: slug, slug }).returning();
    const [a] = await securityDb(env).insert(app).values({ workspaceId: ws.id, name: slug, slug: "main" }).returning();
    const [owner] = await securityDb(env).insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
    await securityDb(env).insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
    const { secret } = await createApiKey(env, { workspaceId: ws.id, appId: a.id, name: "web" });
    await seedSender(ws.id, "tiffingrab.ca", from, { appId: a.id });
    const body = { stream: "transactional", from, to: "guest@x.com", subject: "Order\r\nBcc: spy@x.com", html: "<p>Thanks</p>", text: "Thanks" };

    const res = await SELF.fetch("https://relay.test/api/v1/messages", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid input" });
    expect(await rowCount(stubFor(ws.id))).toBe(0);
  });
});

describe("marketing sends carry an unsubscribe link", () => {
  it("refuses a raw marketing send without {{unsubscribe_url}} at the API, and queues one that has it", async () => {
    const slug = "http-unsub";
    const [ws] = await securityDb(env).insert(workspace).values({ name: slug, slug }).returning();
    const [a] = await securityDb(env).insert(app).values({ workspaceId: ws.id, name: slug, slug: "main" }).returning();
    const [owner] = await securityDb(env).insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
    await securityDb(env).insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
    const { secret } = await createApiKey(env, { workspaceId: ws.id, appId: a.id, name: "web" });
    await seedSender(ws.id, "tiffingrab.ca", from, { appId: a.id });
    const post = (payload: unknown) =>
      SELF.fetch("https://relay.test/api/v1/messages", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    const body = { stream: "marketing", from, to: "guest@x.com", subject: "Sale", html: "<p>Hi</p>", text: "Hi" };

    const refused = await post(body);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "unsubscribe link required" });
    const queued = await post({ ...body, html: '<a href="{{unsubscribe_url}}">Stop</a>', text: "Stop: {{unsubscribe_url}}" });
    expect(queued.status).toBe(202);
  });
});

describe("send attachments are limited at the API", () => {
  it("refuses a fourth attachment and one over 5 MB", async () => {
    const slug = "http-attach";
    const [ws] = await securityDb(env).insert(workspace).values({ name: slug, slug }).returning();
    const [a] = await securityDb(env).insert(app).values({ workspaceId: ws.id, name: slug, slug: "main" }).returning();
    const [owner] = await securityDb(env).insert(user).values({ name: slug, email: `${slug}@owner.test` }).returning();
    await securityDb(env).insert(member).values({ organizationId: ws.id, userId: owner.id, role: "owner" });
    const { secret } = await createApiKey(env, { workspaceId: ws.id, appId: a.id, name: "web" });
    await seedSender(ws.id, "tiffingrab.ca", from, { appId: a.id });
    const post = (attachments: unknown[]) =>
      SELF.fetch("https://relay.test/api/v1/messages", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ ...base, attachments }),
      });
    const file = (content: string) => ({ filename: "a.pdf", contentType: "application/pdf", content });

    const four = await post([file("AAAA"), file("AAAA"), file("AAAA"), file("AAAA")]);
    expect(four.status).toBe(400);
    expect(await four.json()).toEqual({ error: "invalid input" });

    // 6 MiB decoded: 8 MiB of base64 "A" is 6 MiB of zero bytes.
    const big = await post([file("A".repeat(8 * 1024 * 1024))]);
    expect(big.status).toBe(400);
    expect(await big.json()).toEqual({ error: "invalid input" });
    expect(await rowCount(stubFor(ws.id))).toBe(0);
  });
});
