import { env, runInDurableObject } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handleSesEventBatch } from "../src/jobs/ses-event-consumer";
import type { SesEventJob } from "../src/core/ses-events";
import { handleSendBatch } from "../src/jobs/send-consumer";
import { memorySesTransport } from "../src/core/ses";
import { coreDb } from "../src/db/core/client";
import { address, sendingDomain, usageDaily } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { workspace } from "../src/db/security/schema";
import { applyMigrations } from "./migrate";

const base = {
  appId: "app_1",
  stream: "transactional" as const,
  from: "orders@tiffingrab.ca",
  to: "guest@x.com",
  subject: "Order 1",
  html: "<p>Thanks</p>",
  text: "Thanks",
};

const OCCURRED = Date.UTC(2026, 10, 24, 12);
const DAY = "2026-11-24";

let seq = 0;

function event(workspaceId: string, messageId: string, over: Partial<SesEventJob> = {}): SesEventJob {
  seq++;
  return {
    workspaceId,
    messageId,
    sesMessageId: "mem-1",
    snsMessageId: `sns-${seq}`,
    type: "Open",
    occurredAt: OCCURRED,
    recipients: [],
    ...over,
  };
}

type Outcome = { kind: "none" } | { kind: "ack" } | { kind: "retry"; delaySeconds?: number };

// Hand-made batch: records the ack or retry each message receives.
function batchOf(bodies: SesEventJob[]) {
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
  return { batch: { queue: "relay-ses-events", messages } as never, outcomes };
}

async function seedWorkspace(workspaceId: string) {
  await securityDb(env).insert(workspace).values({ id: workspaceId, name: workspaceId, slug: workspaceId });
  await coreDb(env)
    .insert(sendingDomain)
    .values({ workspaceId, domain: "tiffingrab.ca", sesRegion: "us-east-1", status: "verified" })
    .onConflictDoUpdate({ target: sendingDomain.domain, set: { workspaceId, sesRegion: "us-east-1", status: "verified" } });
  await coreDb(env)
    .insert(address)
    .values({ workspaceId, appId: "app_1", email: "orders@tiffingrab.ca", kind: "sender", displayName: "TiffinGrab", canSend: true })
    .onConflictDoUpdate({ target: address.email, set: { workspaceId, displayName: "TiffinGrab", canSend: true } });
  return env.CLIENT.get(env.CLIENT.idFromName(workspaceId));
}

// Seeds a sent message: its SES id is "mem-1" from the memory transport.
async function sentMessage(workspaceId: string) {
  const stub = await seedWorkspace(workspaceId);
  const { messageId } = await stub.send(workspaceId, base);
  const body = { workspaceId, messageId };
  await handleSendBatch({ messages: [{ body, ack() {}, retry() {} }] } as never, env, memorySesTransport);
  const sesMessageId = (await stub.getMessage(workspaceId, messageId))!.sesMessageId!;
  return { stub, messageId, sesMessageId };
}

async function rows(stub: Awaited<ReturnType<typeof seedWorkspace>>, sql: string) {
  return runInDurableObject(stub, (_instance, state) => state.storage.sql.exec(sql).toArray());
}

async function usageOf(workspaceId: string) {
  const [row] = await coreDb(env)
    .select({ delivered: usageDaily.delivered, bounced: usageDaily.bounced })
    .from(usageDaily)
    .where(and(eq(usageDaily.workspaceId, workspaceId), eq(usageDaily.day, DAY)));
  return { delivered: row?.delivered ?? 0, bounced: row?.bounced ?? 0 };
}

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(() => {
  memorySesTransport.reset();
  vi.spyOn(env.SEND, "send").mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applySesEvents", () => {
  it("records a Delivery and returns it as delivered usage for the event day", async () => {
    const ws = "wsp_delivery";
    const { stub, messageId } = await sentMessage(ws);
    const result = await stub.applySesEvents(ws, [event(ws, messageId, { type: "Delivery", recipients: ["guest@x.com"] })]);
    expect(result).toEqual({ applied: 1, ignored: 0, failed: [], usage: [{ day: DAY, delivered: 1, bounced: 0 }] });
    expect(await rows(stub, "SELECT type, recipient FROM message_event")).toEqual([{ type: "Delivery", recipient: "guest@x.com" }]);
  });

  it("counts a replayed Open once: one row, opens stays 1, second call ignored", async () => {
    const ws = "wsp_open_replay";
    const { stub, messageId } = await sentMessage(ws);
    const open = event(ws, messageId);
    expect(await stub.applySesEvents(ws, [open])).toMatchObject({ applied: 1, ignored: 0 });
    expect(await stub.applySesEvents(ws, [open])).toMatchObject({ applied: 0, ignored: 1, usage: [] });
    expect(await rows(stub, "SELECT type FROM message_event")).toHaveLength(1);
    expect((await stub.getMessage(ws, messageId))!.opens).toBe(1);
  });

  it("backfills the SES id and sent status from a Send event on a queued row", async () => {
    const ws = "wsp_send_backfill";
    const stub = await seedWorkspace(ws);
    const { messageId } = await stub.send(ws, base);
    await stub.applySesEvents(ws, [event(ws, messageId, { type: "Send", sesMessageId: "ses-backfill" })]);
    const msg = (await stub.getMessage(ws, messageId))!;
    expect(msg).toMatchObject({ status: "sent", sesMessageId: "ses-backfill" });
  });

  it("leaves an already-sent row unchanged on a Send event", async () => {
    const ws = "wsp_send_noop";
    const { stub, messageId, sesMessageId } = await sentMessage(ws);
    await stub.applySesEvents(ws, [event(ws, messageId, { type: "Send", sesMessageId })]);
    expect(await stub.getMessage(ws, messageId)).toMatchObject({ status: "sent", sesMessageId });
  });

  it("counts a Delivery after a backfilled Send as delivered", async () => {
    const ws = "wsp_send_delivery";
    const stub = await seedWorkspace(ws);
    const { messageId } = await stub.send(ws, base);
    const result = await stub.applySesEvents(ws, [
      event(ws, messageId, { type: "Send", sesMessageId: "ses-then-delivery" }),
      event(ws, messageId, { type: "Delivery", sesMessageId: "ses-then-delivery", recipients: ["guest@x.com"] }),
    ]);
    expect(result).toMatchObject({ applied: 2, usage: [{ day: DAY, delivered: 1, bounced: 0 }] });
    expect(await stub.getMessage(ws, messageId)).toMatchObject({ status: "sent", sesMessageId: "ses-then-delivery" });
  });

  it("marks a queued row sent from a Delivery that arrives before the Send event, and counts it once", async () => {
    const ws = "wsp_delivery_first";
    const stub = await seedWorkspace(ws);
    const { messageId } = await stub.send(ws, base);
    const first = await stub.applySesEvents(ws, [
      event(ws, messageId, { type: "Delivery", sesMessageId: "ses-dfirst", recipients: ["guest@x.com"] }),
    ]);
    expect(first.usage).toEqual([{ day: DAY, delivered: 1, bounced: 0, sent: 1 }]);
    expect(await stub.getMessage(ws, messageId)).toMatchObject({ status: "sent", sesMessageId: "ses-dfirst" });
    const late = await stub.applySesEvents(ws, [event(ws, messageId, { type: "Send", sesMessageId: "ses-dfirst" })]);
    expect(late.usage).toEqual([]);
  });

  it("leaves a failed row failed on a Delivery event", async () => {
    const ws = "wsp_failed_row";
    const stub = await seedWorkspace(ws);
    const { messageId } = await stub.send(ws, base);
    await runInDurableObject(stub, (_i, state) => state.storage.sql.exec("UPDATE message SET status = 'failed'"));
    const result = await stub.applySesEvents(ws, [event(ws, messageId, { type: "Delivery", sesMessageId: "ses-f", recipients: ["guest@x.com"] })]);
    expect(result.usage).toEqual([{ day: DAY, delivered: 1, bounced: 0 }]);
    expect(await stub.getMessage(ws, messageId)).toMatchObject({ status: "failed", sesMessageId: null });
  });

  it("counts two Opens with different SNS ids as two opens", async () => {
    const ws = "wsp_opens";
    const { stub, messageId } = await sentMessage(ws);
    await stub.applySesEvents(ws, [event(ws, messageId), event(ws, messageId)]);
    expect((await stub.getMessage(ws, messageId))!.opens).toBe(2);
  });

  it("counts a Click and keeps the link in detail", async () => {
    const ws = "wsp_click";
    const { stub, messageId } = await sentMessage(ws);
    await stub.applySesEvents(ws, [event(ws, messageId, { type: "Click", link: "https://tiffingrab.ca/menu" })]);
    expect((await stub.getMessage(ws, messageId))!.clicks).toBe(1);
    const [row] = await rows(stub, "SELECT detail FROM message_event");
    expect(JSON.parse(row.detail as string)).toEqual({ link: "https://tiffingrab.ca/menu" });
  });

  it("suppresses a permanently bounced address on every stream, normalized to lowercase", async () => {
    const ws = "wsp_hard_bounce";
    const { stub, messageId } = await sentMessage(ws);
    const bounce = event(ws, messageId, { type: "Bounce", bounceType: "Permanent", recipients: ["a@x.com"] });
    const result = await stub.applySesEvents(ws, [bounce]);
    expect(result.usage).toEqual([{ day: DAY, delivered: 0, bounced: 1 }]);
    expect(await stub.isSuppressed(ws, "a@x.com", "marketing")).toBe(true);
    expect(await stub.isSuppressed(ws, "a@x.com", "transactional")).toBe(true);
    expect(await rows(stub, "SELECT email, reason, stream FROM suppression")).toEqual([
      { email: "a@x.com", reason: "bounce", stream: null },
    ]);
  });

  it("upgrades a bounce suppression to complaint when a complaint arrives later", async () => {
    const ws = "wsp_complaint";
    const { stub, messageId } = await sentMessage(ws);
    await stub.applySesEvents(ws, [event(ws, messageId, { type: "Bounce", bounceType: "Permanent", recipients: ["a@x.com"] })]);
    await stub.applySesEvents(ws, [event(ws, messageId, { type: "Complaint", recipients: ["a@x.com"] })]);
    expect(await rows(stub, "SELECT reason FROM suppression")).toEqual([{ reason: "complaint" }]);
  });

  it("records a transient bounce and counts it, without suppressing", async () => {
    const ws = "wsp_transient";
    const { stub, messageId } = await sentMessage(ws);
    const bounce = event(ws, messageId, { type: "Bounce", bounceType: "Transient", recipients: ["t@x.com"] });
    const result = await stub.applySesEvents(ws, [bounce]);
    expect(result).toMatchObject({ applied: 1, usage: [{ day: DAY, delivered: 0, bounced: 1 }] });
    expect(await stub.isSuppressed(ws, "t@x.com", "marketing")).toBe(false);
    expect(await rows(stub, "SELECT detail FROM message_event")).toEqual([{ detail: JSON.stringify({ bounceType: "Transient" }) }]);
  });

  it("ignores an event whose message is not in this workspace's DO", async () => {
    const ws = "wsp_unknown";
    const { stub } = await sentMessage(ws);
    const bounce = event(ws, "msg_nope", { type: "Bounce", bounceType: "Permanent", recipients: ["u@x.com"] });
    expect(await stub.applySesEvents(ws, [bounce])).toEqual({ applied: 0, ignored: 1, failed: [], usage: [] });
    expect(await rows(stub, "SELECT type FROM message_event")).toEqual([]);
    expect(await stub.isSuppressed(ws, "u@x.com", "marketing")).toBe(false);
  });

  it("ignores an event whose SES message id differs from the stored one", async () => {
    const ws = "wsp_other_ses";
    const { stub, messageId } = await sentMessage(ws);
    const bounce = event(ws, messageId, { sesMessageId: "other", type: "Bounce", bounceType: "Permanent", recipients: ["o@x.com"] });
    expect(await stub.applySesEvents(ws, [bounce])).toEqual({ applied: 0, ignored: 1, failed: [], usage: [] });
    expect(await rows(stub, "SELECT type FROM message_event")).toEqual([]);
    expect(await stub.isSuppressed(ws, "o@x.com", "marketing")).toBe(false);
  });

  it("ignores an event whose workspace does not match the DO it was sent to", async () => {
    const ws = "wsp_p";
    const { stub, messageId } = await sentMessage(ws);
    const foreign = event("wsp_other", messageId, { type: "Bounce", bounceType: "Permanent", recipients: ["f@x.com"] });
    expect(await stub.applySesEvents(ws, [foreign])).toEqual({ applied: 0, ignored: 1, failed: [], usage: [] });
    expect(await rows(stub, "SELECT type FROM message_event")).toEqual([]);
    expect(await stub.isSuppressed(ws, "f@x.com", "marketing")).toBe(false);
  });
});

describe("handleSesEventBatch", () => {
  it("applies one group per workspace, acks every message, and counts a replayed delivery once", async () => {
    const a = await sentMessage("wsp_batch_a");
    const b = await sentMessage("wsp_batch_b");
    const delivery = event("wsp_batch_a", a.messageId, { sesMessageId: a.sesMessageId, type: "Delivery", recipients: ["guest@x.com"] });
    const { batch, outcomes } = batchOf([
      delivery,
      event("wsp_batch_b", b.messageId, { sesMessageId: b.sesMessageId, type: "Delivery", recipients: ["guest@x.com"] }),
    ]);
    await handleSesEventBatch(batch, env);
    expect(outcomes).toEqual([{ kind: "ack" }, { kind: "ack" }]);
    expect(await usageOf("wsp_batch_a")).toEqual({ delivered: 1, bounced: 0 });
    expect(await usageOf("wsp_batch_b")).toEqual({ delivered: 1, bounced: 0 });

    const replay = batchOf([delivery]);
    await handleSesEventBatch(replay.batch, env);
    expect(replay.outcomes).toEqual([{ kind: "ack" }]);
    expect(await usageOf("wsp_batch_a")).toEqual({ delivered: 1, bounced: 0 });
  });

  it("retries only the workspace group whose DO throws", async () => {
    const a = await sentMessage("wsp_fail_a");
    const b = await sentMessage("wsp_fail_b");
    const realGet = env.CLIENT.get.bind(env.CLIENT);
    vi.spyOn(env.CLIENT, "get").mockImplementation((id) => {
      const real = realGet(id);
      return {
        applySesEvents: (workspaceId: string, events: SesEventJob[]) =>
          workspaceId === "wsp_fail_b" ? Promise.reject(new Error("do down")) : real.applySesEvents(workspaceId, events),
      } as never;
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { batch, outcomes } = batchOf([
      event("wsp_fail_a", a.messageId, { sesMessageId: a.sesMessageId, type: "Delivery" }),
      event("wsp_fail_b", b.messageId, { sesMessageId: b.sesMessageId, type: "Delivery" }),
    ]);
    await handleSesEventBatch(batch, env);
    expect(outcomes).toEqual([{ kind: "ack" }, { kind: "retry", delaySeconds: 30 }]);
    expect(await usageOf("wsp_fail_b")).toEqual({ delivered: 0, bounced: 0 });
  });

  it("commits the events around a throwing one, counts them once, and retries only that message", async () => {
    const ws = "wsp_partial";
    const { stub, messageId, sesMessageId } = await sentMessage(ws);
    const first = event(ws, messageId, { sesMessageId, type: "Delivery" });
    // A non-string recipient makes this event's transaction throw, so it rolls back alone.
    const poison = event(ws, messageId, { sesMessageId, type: "Bounce", bounceType: "Permanent", recipients: [null as unknown as string] });
    const third = event(ws, messageId, { sesMessageId, type: "Delivery" });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { batch, outcomes } = batchOf([first, poison, third]);
    await handleSesEventBatch(batch, env);
    expect(outcomes).toEqual([{ kind: "ack" }, { kind: "retry", delaySeconds: 30 }, { kind: "ack" }]);
    expect(await usageOf(ws)).toEqual({ delivered: 2, bounced: 0 });
    expect(await rows(stub, "SELECT type FROM message_event ORDER BY id")).toEqual([{ type: "Delivery" }, { type: "Delivery" }]);

    const replay = batchOf([first, poison, third]);
    await handleSesEventBatch(replay.batch, env);
    expect(replay.outcomes).toEqual([{ kind: "ack" }, { kind: "retry", delaySeconds: 30 }, { kind: "ack" }]);
    expect(await usageOf(ws)).toEqual({ delivered: 2, bounced: 0 });
  });
});
