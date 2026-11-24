import { createHmac } from "node:crypto";
import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createAddress } from "../src/core/addresses";
import { handleInboundBatch } from "../src/core/inbound-consumer";
import { handleWebhookBatch } from "../src/core/webhook-consumer";
import type { ClientDO } from "../src/do/client-do";
import * as schema from "../src/do/client-schema";
import { securityDb } from "../src/db/security/client";
import { app, workspace } from "../src/db/security/schema";
import type { InboundJob, WebhookJob } from "../src/env";
import worker from "../src/server";
import { applyMigrations } from "./migrate";

const MIN = 60_000;
const HOUR = 60 * MIN;
const SECRET = "test-webhook-secret-0123456789abcdef";
const url = "https://tg.example/api/webhooks/relay";

const stubFor = (workspaceId: string) => env.CLIENT.get(env.CLIENT.idFromName(workspaceId));
const rowsOf = (stub: ReturnType<typeof stubFor>, sql: string, ...args: (string | number)[]) =>
  runInDurableObject(stub, (_instance, state) => state.storage.sql.exec(sql, ...args).toArray());
const deliveryRow = async (stub: ReturnType<typeof stubFor>, id: string) =>
  (
    await rowsOf(
      stub,
      "SELECT status, attempts, last_error, response_status FROM webhook_delivery WHERE id = ?",
      id,
    )
  )[0];

type Outcome = { kind: "none" } | { kind: "ack" } | { kind: "retry"; delaySeconds?: number };

// Hand-made batch: records the ack or retry each message receives.
function batchOf<T>(queue: string, bodies: T[]) {
  const outcomes: Outcome[] = bodies.map((): Outcome => ({ kind: "none" }));
  const messages = bodies.map((body, i) => ({
    id: `job-${i}`,
    timestamp: new Date(),
    body,
    attempts: 1,
    ack: () => {
      outcomes[i] = { kind: "ack" };
    },
    retry: (opts?: { delaySeconds?: number }) => {
      outcomes[i] = { kind: "retry", delaySeconds: opts?.delaySeconds };
    },
  }));
  return { batch: { queue, messages } as never, outcomes };
}

async function deliver(job: WebhookJob, fetchImpl: typeof fetch): Promise<Outcome> {
  const { batch, outcomes } = batchOf("relay-webhooks", [job]);
  await handleWebhookBatch(batch, env, fetchImpl);
  return outcomes[0];
}

// Replies in order; the last one repeats. An Error is thrown instead of returned.
type Reply = number | { redirect: string } | Error;
function fetchReplies(...replies: Reply[]) {
  let call = 0;
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const reply = replies[Math.min(call++, replies.length - 1)];
    if (reply instanceof Error) throw reply;
    if (typeof reply === "number") return new Response("receiver body", { status: reply });
    return new Response(null, { status: 302, headers: { location: reply.redirect } });
  });
}

// The TiffinGrab receiver's check, copied from realm-interac apps/tiffin-grab/app/api/webhooks/relay/route.ts.
async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function tenant(slug: string) {
  const db = securityDb(env);
  const [ws] = await db.insert(workspace).values({ name: slug, slug }).returning();
  const [a] = await db.insert(app).values({ workspaceId: ws.id, name: slug, slug: "main" }).returning();
  return { workspaceId: ws.id, appId: a.id };
}

const LETTER = [
  "From: cust@example.com",
  "To: info@tiffingrab.ca",
  "Subject: Invoice",
  "Message-ID: <e2e@x>",
  "Date: Tue, 01 Jul 2025 10:00:00 +0000",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hello",
].join("\r\n");

// Stores a letter under the workspace's raw prefix and ingests it straight into the DO.
async function ingest(workspaceId: string, appId: string, stub: ReturnType<typeof stubFor>, letter = LETTER) {
  const rawKey = `ws/${workspaceId}/raw/2026/11/${crypto.randomUUID()}.eml`;
  await env.MAIL.put(rawKey, new TextEncoder().encode(letter).buffer as ArrayBuffer);
  const job: InboundJob = {
    workspaceId,
    appId,
    addressId: "add_1",
    rawKey,
    envelopeFrom: "bounce@example.com",
    envelopeTo: "info@tiffingrab.ca",
    authResults: null,
    receivedAt: 1_700_000_000_000,
  };
  return (await stub.ingestInbound(workspaceId, job)) as { messageId: string; deliveries: number };
}

async function deliveryIdFor(stub: ReturnType<typeof stubFor>, messageId: string): Promise<string> {
  const [row] = await rowsOf(stub, "SELECT id FROM webhook_delivery WHERE message_id = ?", messageId);
  return row.id as string;
}

let sendBatch: MockInstance<typeof env.WEBHOOKS.sendBatch>;
let consoleError: MockInstance<typeof console.error>;

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(() => {
  sendBatch = vi.spyOn(env.WEBHOOKS, "sendBatch").mockResolvedValue(undefined as never);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // PII never logged: no address, URL or secret reaches the console.
  for (const call of consoleError.mock.calls) {
    const text = call.map(String).join(" ");
    expect(text).not.toContain("@");
    expect(text).not.toContain(url);
    expect(text).not.toContain(SECRET);
  }
  vi.restoreAllMocks();
});

describe("mailbox.received delivery", () => {
  it("delivers the signed body end to end, checked the way TiffinGrab's receiver checks it", async () => {
    const { workspaceId, appId } = await tenant("wh-e2e");
    const stub = stubFor(workspaceId);
    await createAddress(env, { workspaceId, appId, email: "info@tiffingrab.ca", kind: "inbox" });
    await stub.createWebhook(workspaceId, appId, { url, events: ["mailbox.received"], secret: SECRET });
    const inboundSend = vi.spyOn(env.INBOUND, "send").mockResolvedValue(undefined as never);
    const raw = new TextEncoder().encode(LETTER);
    await worker.email!(
      {
        from: "bounce@example.com",
        to: "info@tiffingrab.ca",
        rawSize: raw.byteLength,
        raw: new Response(raw).body,
        headers: new Headers(),
        setReject: vi.fn(),
      } as unknown as ForwardableEmailMessage,
      env,
    );
    const inboundJob = inboundSend.mock.calls[0][0] as InboundJob;
    const inbound = batchOf("relay-v2-inbound", [inboundJob]);
    await handleInboundBatch(inbound.batch, env);

    expect(sendBatch).toHaveBeenCalledTimes(1);
    const [[queued]] = sendBatch.mock.calls[0] as unknown as [{ body: WebhookJob }[]];
    const fetchSpy = fetchReplies(200);
    expect(await deliver(queued.body, fetchSpy)).toEqual({ kind: "ack" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [target, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(target).toBe(url);
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    const expectedSignature = "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
    expect(headers["x-relay-signature"]).toBe(expectedSignature);
    expect(sameString(headers["x-relay-signature"], "sha256=" + (await hmacHex(SECRET, body)))).toBe(true);

    const parsed = JSON.parse(body) as { type: string; data: Record<string, unknown> };
    expect(parsed.type).toBe("mailbox.received");
    expect(Object.keys(parsed.data)).toEqual([
      "to", "from", "html", "text", "subject", "fromName", "messageId", "envelopeTo", "receivedAt", "authResults", "envelopeFrom",
    ]);
    const delivery = await deliveryRow(stub, queued.body.deliveryId);
    expect(delivery).toEqual({ status: "sent", attempts: 1, last_error: null, response_status: 200 });
    const [{ message_id }] = await rowsOf(stub, "SELECT message_id FROM webhook_delivery WHERE id = ?", queued.body.deliveryId);
    expect(parsed.data.messageId).toBe(message_id);
  });

  it("retries after 60 s then 120 s with byte-identical bodies and signatures, and ends sent on attempt 3", async () => {
    const { workspaceId, appId } = await tenant("wh-retry");
    const stub = stubFor(workspaceId);
    await stub.createWebhook(workspaceId, appId, { url, events: ["mailbox.received"], secret: SECRET });
    const { messageId } = await ingest(workspaceId, appId, stub);
    const id = await deliveryIdFor(stub, messageId);
    const job = { workspaceId, deliveryId: id };
    const fetchSpy = fetchReplies(500, 500, 200);

    expect(await deliver(job, fetchSpy)).toEqual({ kind: "retry", delaySeconds: 60 });
    expect(await deliver(job, fetchSpy)).toEqual({ kind: "retry", delaySeconds: 120 });
    expect(await deliver(job, fetchSpy)).toEqual({ kind: "ack" });

    const sent = fetchSpy.mock.calls.map(([, init]) => init as RequestInit);
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((init) => init.body)).size).toBe(1);
    expect(new Set(sent.map((init) => (init.headers as Record<string, string>)["x-relay-signature"])).size).toBe(1);
    expect(await deliveryRow(stub, id)).toEqual({ status: "sent", attempts: 3, last_error: null, response_status: 200 });
  });

  it("fails the delivery after attempt 6, storing only the status code", async () => {
    const { workspaceId, appId } = await tenant("wh-dead");
    const stub = stubFor(workspaceId);
    await stub.createWebhook(workspaceId, appId, { url, events: ["mailbox.received"], secret: SECRET });
    const { messageId } = await ingest(workspaceId, appId, stub);
    const id = await deliveryIdFor(stub, messageId);
    const job = { workspaceId, deliveryId: id };
    const fetchSpy = fetchReplies(500);

    const outcomes = [];
    for (let i = 0; i < 6; i++) outcomes.push(await deliver(job, fetchSpy));

    expect(outcomes.slice(0, 5)).toEqual([
      { kind: "retry", delaySeconds: 60 },
      { kind: "retry", delaySeconds: 120 },
      { kind: "retry", delaySeconds: 240 },
      { kind: "retry", delaySeconds: 480 },
      { kind: "retry", delaySeconds: 960 },
    ]);
    expect(outcomes[5]).toEqual({ kind: "ack" });
    expect(fetchSpy).toHaveBeenCalledTimes(6);
    expect(await deliveryRow(stub, id)).toEqual({ status: "failed", attempts: 6, last_error: "HTTP 500", response_status: 500 });
  });

  it("treats a 302 as a failed attempt and never follows it", async () => {
    const { workspaceId, appId } = await tenant("wh-redirect");
    const stub = stubFor(workspaceId);
    await stub.createWebhook(workspaceId, appId, { url, events: ["mailbox.received"], secret: SECRET });
    const { messageId } = await ingest(workspaceId, appId, stub);
    const id = await deliveryIdFor(stub, messageId);
    const fetchSpy = fetchReplies({ redirect: "https://elsewhere.example/hook" });

    expect(await deliver({ workspaceId, deliveryId: id }, fetchSpy)).toEqual({ kind: "retry", delaySeconds: 60 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1]).redirect).toBe("manual");
    expect(await deliveryRow(stub, id)).toEqual({ status: "pending", attempts: 1, last_error: "HTTP 302", response_status: 302 });
  });

  it("records the error name when the fetch times out", async () => {
    const { workspaceId, appId } = await tenant("wh-timeout");
    const stub = stubFor(workspaceId);
    await stub.createWebhook(workspaceId, appId, { url, events: ["mailbox.received"], secret: SECRET });
    const { messageId } = await ingest(workspaceId, appId, stub);
    const id = await deliveryIdFor(stub, messageId);
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });

    expect(await deliver({ workspaceId, deliveryId: id }, fetchReplies(timeout))).toEqual({ kind: "retry", delaySeconds: 60 });
    expect(await deliveryRow(stub, id)).toEqual({ status: "pending", attempts: 1, last_error: "TimeoutError", response_status: null });
  });

  it("fails without fetching when the webhook was disabled after ingest", async () => {
    const { workspaceId, appId } = await tenant("wh-disabled");
    const stub = stubFor(workspaceId);
    const { webhook } = await stub.createWebhook(workspaceId, appId, { url, events: ["mailbox.received"], secret: SECRET });
    const { messageId } = await ingest(workspaceId, appId, stub);
    const id = await deliveryIdFor(stub, messageId);
    await stub.updateWebhook(workspaceId, appId, webhook.id, { enabled: false });
    const fetchSpy = fetchReplies(200);

    expect(await deliver({ workspaceId, deliveryId: id }, fetchSpy)).toEqual({ kind: "ack" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await deliveryRow(stub, id)).toEqual({ status: "failed", attempts: 0, last_error: "Webhook missing or disabled", response_status: null });
  });

  it("does not fetch a stored URL that is no longer public, and fails it", async () => {
    const { workspaceId, appId } = await tenant("wh-ssrf");
    const stub = stubFor(workspaceId);
    const { webhook } = await stub.createWebhook(workspaceId, appId, { url, events: ["mailbox.received"], secret: SECRET });
    const { messageId } = await ingest(workspaceId, appId, stub);
    const id = await deliveryIdFor(stub, messageId);
    await runInDurableObject(stub, (_i, state) =>
      state.storage.sql.exec("UPDATE webhook SET url = ? WHERE id = ?", "https://127.0.0.1/hook", webhook.id),
    );
    const fetchSpy = fetchReplies(200);

    expect(await deliver({ workspaceId, deliveryId: id }, fetchSpy)).toEqual({ kind: "ack" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await deliveryRow(stub, id)).toEqual({ status: "failed", attempts: 0, last_error: "URL not public", response_status: null });
  });

  it("answers busy while another claim holds the lease, with one fetch", async () => {
    const { workspaceId, appId } = await tenant("wh-busy");
    const stub = stubFor(workspaceId);
    await stub.createWebhook(workspaceId, appId, { url, events: ["mailbox.received"], secret: SECRET });
    const { messageId } = await ingest(workspaceId, appId, stub);
    const id = await deliveryIdFor(stub, messageId);
    const job = { workspaceId, deliveryId: id };

    let release!: (res: Response) => void;
    const held = new Promise<Response>((resolve) => (release = resolve));
    const fetchSpy = vi.fn(() => held);
    const first = deliver(job, fetchSpy);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    const second = await deliver(job, fetchReplies(200));
    expect(second).toEqual({ kind: "retry", delaySeconds: 60 });
    release(new Response("ok", { status: 200 }));
    expect(await first).toEqual({ kind: "ack" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the delivery pending and throws for a missing key, without spending an attempt", async () => {
    const { workspaceId, appId } = await tenant("wh-nokey");
    const stub = stubFor(workspaceId);
    await stub.createWebhook(workspaceId, appId, { url, events: ["mailbox.received"], secret: SECRET });
    const { messageId } = await ingest(workspaceId, appId, stub);
    const id = await deliveryIdFor(stub, messageId);
    const fetchSpy = fetchReplies(200);
    const key = env.WEBHOOK_SECRET_KEY;
    try {
      // The DO reads its own env, so this is only effective when the runtime shares the binding object.
      (env as { WEBHOOK_SECRET_KEY?: string }).WEBHOOK_SECRET_KEY = undefined;
      expect(await deliver({ workspaceId, deliveryId: id }, fetchSpy)).toEqual({ kind: "retry", delaySeconds: 30 });
    } finally {
      (env as { WEBHOOK_SECRET_KEY?: string }).WEBHOOK_SECRET_KEY = key;
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await deliveryRow(stub, id)).toEqual({ status: "pending", attempts: 0, last_error: null, response_status: null });
  });
});

describe("relay-webhooks sweep", () => {
  it("re-enqueues a pending delivery stale for 21 minutes and fails one older than 24 hours", async () => {
    const { workspaceId, appId } = await tenant("wh-sweep");
    const stub = stubFor(workspaceId);
    await stub.createWebhook(workspaceId, appId, { url, events: ["mailbox.received"], secret: SECRET });
    const now = Date.now();
    const base = { webhookId: "whk_x", appId, messageId: "msg_x", event: "mailbox.received", payloadKey: "k", nextAttemptAt: now };
    await runInDurableObject<ClientDO, void>(stub, (inst) => {
      inst.db.insert(schema.webhookDelivery).values({ ...base, createdAt: now - 21 * MIN, updatedAt: now - 21 * MIN }).run();
      inst.db.insert(schema.webhookDelivery).values({ ...base, messageId: "msg_old", createdAt: now - 25 * HOUR, updatedAt: now - 25 * HOUR }).run();
    });
    const rows = await rowsOf(stub, "SELECT id, message_id FROM webhook_delivery WHERE message_id IN ('msg_x', 'msg_old')");
    const fresh = rows.find((r) => r.message_id === "msg_x")!.id as string;
    const old = rows.find((r) => r.message_id === "msg_old")!.id as string;

    await runInDurableObject(stub, (inst) => inst.sweepQueued(now));

    expect(sendBatch).toHaveBeenCalledWith([{ body: { workspaceId, deliveryId: fresh } }]);
    expect(await deliveryRow(stub, old)).toEqual({ status: "failed", attempts: 0, last_error: "expired", response_status: null });
    expect(await deliveryRow(stub, fresh)).toEqual({ status: "pending", attempts: 0, last_error: null, response_status: null });
  });
});
