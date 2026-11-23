import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { ClientDO } from "../src/do/client-do";
import * as schema from "../src/do/client-schema";
import { securityDb } from "../src/db/security/client";
import { workspace } from "../src/db/security/schema";
import { applyMigrations, seedVerifiedSender } from "./migrate";

const MIN = 60_000;
const HOUR = 60 * MIN;

const base = {
  appId: "app_1",
  stream: "transactional" as const,
  from: "Relay@A6n.ai",
  to: "a@x.com",
  subject: "Order 1",
  html: "<p>Thanks</p>",
  text: "Thanks",
};

const stubFor = (workspaceId: string) => env.CLIENT.get(env.CLIENT.idFromName(workspaceId));

async function seededStub(workspaceId: string) {
  await securityDb(env).insert(workspace).values({ id: workspaceId, name: workspaceId, slug: workspaceId });
  await seedVerifiedSender(workspaceId);
  const stub = stubFor(workspaceId);
  await stub.ping(workspaceId);
  return stub;
}

type Status = "queued" | "sent" | "failed" | "suppressed";
type Row = { id: string; status?: Status; createdAt: number; updatedAt: number; claimedUntil?: number | null };

function insertRows(instance: ClientDO, rows: Row[]) {
  for (const r of rows) {
    instance.db
      .insert(schema.message)
      .values({
        id: r.id,
        appId: "app_1",
        direction: "out",
        stream: "transactional",
        status: r.status ?? "queued",
        fromEmail: "relay@a6n.ai",
        toEmail: "a@x.com",
        subject: "s",
        text: "t",
        sesRegion: "ap-south-1",
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        claimedUntil: r.claimedUntil ?? null,
      })
      .run();
  }
}

let sendBatch: MockInstance<typeof env.SEND.sendBatch>;

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(() => {
  vi.spyOn(env.SEND, "send").mockResolvedValue(undefined as never);
  sendBatch = vi.spyOn(env.SEND, "sendBatch").mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ClientDO sweeper alarm", () => {
  it("schedules the alarm when a message is queued", async () => {
    const ws = "wsp_sweep_schedule";
    const stub = await seededStub(ws);
    await stub.send(ws, base);

    const alarm = await runInDurableObject(stub, (_i, state) => state.storage.getAlarm());
    expect(alarm).not.toBeNull();
  });

  it("re-enqueues a stale queued row once, then nothing until it is stale again", async () => {
    const ws = "wsp_sweep_stale";
    const stub = await seededStub(ws);
    const sent = await stub.send(ws, base);
    const now = Date.now();
    await runInDurableObject<ClientDO, void>(stub, (inst) => {
      inst.db.update(schema.message).set({ createdAt: now - 21 * MIN, updatedAt: now - 21 * MIN }).where(eq(schema.message.id, sent.messageId)).run();
    });
    sendBatch.mockClear();

    const first = await runInDurableObject(stub, (inst) => inst.sweepQueued(now));
    expect(first).toEqual({ requeued: 1, expired: 0 });
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(sendBatch).toHaveBeenCalledWith([{ body: { workspaceId: ws, messageId: sent.messageId } }]);

    sendBatch.mockClear();
    const second = await runInDurableObject(stub, (inst) => inst.sweepQueued(now));
    expect(second).toEqual({ requeued: 0, expired: 0 });
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("does not re-enqueue a row updated 5 minutes ago", async () => {
    const ws = "wsp_sweep_fresh";
    const stub = await seededStub(ws);
    const now = Date.now();
    await runInDurableObject<ClientDO, void>(stub, (inst) => {
      insertRows(inst, [{ id: "msg_fresh", createdAt: now - 5 * MIN, updatedAt: now - 5 * MIN }]);
    });
    await runInDurableObject(stub, (inst) => inst.sweepQueued(now));
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("does not re-enqueue a row with a live claim", async () => {
    const ws = "wsp_sweep_claim";
    const stub = await seededStub(ws);
    const now = Date.now();
    await runInDurableObject<ClientDO, void>(stub, (inst) => {
      insertRows(inst, [{ id: "msg_claimed", createdAt: now - 21 * MIN, updatedAt: now - 21 * MIN, claimedUntil: now + MIN }]);
    });
    await runInDurableObject(stub, (inst) => inst.sweepQueued(now));
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("marks a row queued for more than 24 hours as failed", async () => {
    const ws = "wsp_sweep_expire";
    const stub = await seededStub(ws);
    const now = Date.now();
    await runInDurableObject<ClientDO, void>(stub, (inst) => {
      insertRows(inst, [{ id: "msg_old", createdAt: now - 25 * HOUR, updatedAt: now - 25 * HOUR }]);
    });
    const result = await runInDurableObject(stub, (inst) => inst.sweepQueued(now));
    expect(result).toEqual({ requeued: 0, expired: 1 });
    expect(sendBatch).not.toHaveBeenCalled();

    const row = await runInDurableObject(stub, (inst) =>
      inst.db.select().from(schema.message).where(eq(schema.message.id, "msg_old")).get(),
    );
    expect(row).toMatchObject({ status: "failed", error: "expired after 24h in queue" });
  });

  it("never touches sent, failed or suppressed rows", async () => {
    const ws = "wsp_sweep_terminal";
    const stub = await seededStub(ws);
    const now = Date.now();
    const old = now - 25 * HOUR;
    await runInDurableObject<ClientDO, void>(stub, (inst) => {
      insertRows(inst, [
        { id: "msg_sent", status: "sent", createdAt: old, updatedAt: old },
        { id: "msg_failed", status: "failed", createdAt: old, updatedAt: old },
        { id: "msg_suppressed", status: "suppressed", createdAt: old, updatedAt: old },
      ]);
    });
    const result = await runInDurableObject(stub, (inst) => inst.sweepQueued(now));
    expect(result).toEqual({ requeued: 0, expired: 0 });
    expect(sendBatch).not.toHaveBeenCalled();

    const statuses = await runInDurableObject(stub, (inst) =>
      inst.db.select({ id: schema.message.id, status: schema.message.status, error: schema.message.error }).from(schema.message).all(),
    );
    expect(statuses).toEqual(
      expect.arrayContaining([
        { id: "msg_sent", status: "sent", error: null },
        { id: "msg_failed", status: "failed", error: null },
        { id: "msg_suppressed", status: "suppressed", error: null },
      ]),
    );
  });

  it("enqueues 250 stale rows as sendBatch calls of 100, 100 and 50", async () => {
    const ws = "wsp_sweep_batch";
    const stub = await seededStub(ws);
    const now = Date.now();
    const rows = Array.from({ length: 250 }, (_, i) => ({
      id: `msg_batch_${String(i).padStart(3, "0")}`,
      createdAt: now - 21 * MIN,
      updatedAt: now - 21 * MIN,
    }));
    await runInDurableObject<ClientDO, void>(stub, (inst) => insertRows(inst, rows));

    const result = await runInDurableObject(stub, (inst) => inst.sweepQueued(now));
    expect(result).toEqual({ requeued: 250, expired: 0 });
    expect(sendBatch.mock.calls.map(([batch]) => Array.from(batch).length)).toEqual([100, 100, 50]);
  });

  it("alarm re-enqueues stale rows for the bound workspace and reschedules while queued rows remain", async () => {
    const ws = "wsp_sweep_alarm";
    const stub = await seededStub(ws);
    const sent = await stub.send(ws, base);
    await runInDurableObject<ClientDO, void>(stub, (inst) => {
      const old = Date.now() - 21 * MIN;
      inst.db.update(schema.message).set({ createdAt: old, updatedAt: old }).where(eq(schema.message.id, sent.messageId)).run();
    });
    sendBatch.mockClear();

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(sendBatch).toHaveBeenCalledWith([{ body: { workspaceId: ws, messageId: sent.messageId } }]);
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).not.toBeNull();
  });

  it("keeps the next sweep scheduled when sendBatch throws during an alarm run", async () => {
    const ws = "wsp_sweep_throw";
    const stub = await seededStub(ws);
    const sent = await stub.send(ws, base);
    await runInDurableObject<ClientDO, void>(stub, (inst) => {
      const old = Date.now() - 21 * MIN;
      inst.db.update(schema.message).set({ createdAt: old, updatedAt: old }).where(eq(schema.message.id, sent.messageId)).run();
    });
    sendBatch.mockRejectedValue(new Error("queue down"));

    await runDurableObjectAlarm(stub).catch(() => undefined);
    expect(sendBatch).toHaveBeenCalled();
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).not.toBeNull();
  });

  it("alarm on a DO with no bound workspace does nothing and does not reschedule", async () => {
    const stub = env.CLIENT.get(env.CLIENT.newUniqueId());
    await runInDurableObject(stub, (_i, state) => state.storage.setAlarm(Date.now() + 1000));

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(sendBatch).not.toHaveBeenCalled();
    expect(await runInDurableObject(stub, (_i, state) => state.storage.getAlarm())).toBeNull();
  });
});
