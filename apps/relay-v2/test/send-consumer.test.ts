import { AwsError } from "@foundry/cloud";
import { env, runInDurableObject } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { setWorkspaceStatus } from "../src/console/admin";
import { refreshWorkspaceLimits } from "../src/core/limits";
import { handleSendBatch } from "../src/core/send-consumer";
import { memorySesTransport } from "../src/core/ses";
import { utcDay } from "../src/core/usage";
import { coreDb } from "../src/db/core/client";
import { address, sendingDomain, usageDaily } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { workspace } from "../src/db/security/schema";
import type { SendJob } from "../src/env";
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

type Outcome = { kind: "none" } | { kind: "ack" } | { kind: "retry"; delaySeconds?: number };

// Hand-made batch: records the ack or retry each message receives.
function batchOf(bodies: SendJob[]) {
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
  return { batch: { queue: "relay-send", messages } as never, outcomes };
}

async function deliver(...bodies: SendJob[]) {
  const { batch, outcomes } = batchOf(bodies);
  const { sent } = await handleSendBatch(batch, env, memorySesTransport);
  return { sent, outcomes };
}

async function seedWorkspace(workspaceId: string, sesRegion = "us-east-1") {
  await securityDb(env).insert(workspace).values({ id: workspaceId, name: workspaceId, slug: workspaceId });
  await coreDb(env)
    .insert(sendingDomain)
    .values({ workspaceId, domain: "tiffingrab.ca", sesRegion, status: "verified" })
    .onConflictDoUpdate({ target: sendingDomain.domain, set: { workspaceId, sesRegion, status: "verified" } });
  await coreDb(env)
    .insert(address)
    .values({ workspaceId, appId: "app_1", email: "orders@tiffingrab.ca", kind: "sender", displayName: "TiffinGrab", canSend: true })
    .onConflictDoUpdate({ target: address.email, set: { workspaceId, displayName: "TiffinGrab", canSend: true } });
  return env.CLIENT.get(env.CLIENT.idFromName(workspaceId));
}

// Sends through the DO; the SEND spy captures the job instead of letting the consumer run it.
async function queue(stub: Awaited<ReturnType<typeof seedWorkspace>>, workspaceId: string, input = base) {
  const { messageId } = await stub.send(workspaceId, input);
  return { workspaceId, messageId } satisfies SendJob;
}

async function usageSent(workspaceId: string): Promise<number> {
  const [row] = await coreDb(env)
    .select({ sent: usageDaily.sent })
    .from(usageDaily)
    .where(and(eq(usageDaily.workspaceId, workspaceId), eq(usageDaily.day, utcDay(Date.now()))));
  return row?.sent ?? 0;
}

// The first markSent call rejects, as if the DO were unreachable after SES accepted the email.
function failMarkSentOnce() {
  const realGet = env.CLIENT.get.bind(env.CLIENT);
  let fail = true;
  vi.spyOn(env.CLIENT, "get").mockImplementation((id) => {
    const real = realGet(id);
    return {
      claimSend: (...args: Parameters<typeof real.claimSend>) => real.claimSend(...args),
      markSendFailed: (...args: Parameters<typeof real.markSendFailed>) => real.markSendFailed(...args),
      markSent: (...args: Parameters<typeof real.markSent>) => {
        if (fail) {
          fail = false;
          return Promise.reject(new Error("do unreachable"));
        }
        return real.markSent(...args);
      },
    } as never;
  });
}

let enqueue: MockInstance<typeof env.SEND.send>;

beforeAll(async () => {
  await applyMigrations();
});

beforeEach(() => {
  memorySesTransport.reset();
  enqueue = vi.spyOn(env.SEND, "send").mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("utcDay", () => {
  it("formats epoch ms as the UTC calendar day", () => {
    expect(utcDay(Date.UTC(2026, 10, 24, 23, 59))).toBe("2026-11-24");
  });
});

describe("handleSendBatch", () => {
  it("sends once, marks the row sent, acks and counts the send", async () => {
    const ws = "wsp_send_ok";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    const { sent, outcomes } = await deliver(job);

    expect(sent).toBe(1);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(1);
    expect(memorySesTransport.sent[0]).toMatchObject({
      region: "us-east-1",
      stream: "transactional",
      tags: { ws, msg: job.messageId },
    });
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "sent", sesMessageId: "mem-1", attempts: 1 });
    expect(await usageSent(ws)).toBe(1);
  });

  it("does not send again when the same job is redelivered after a send", async () => {
    const ws = "wsp_redeliver";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    await deliver(job);
    const second = await deliver(job);

    expect(second.outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(1);
  });

  it("sends once when two copies of a job are handled concurrently, and retries the loser later", async () => {
    const ws = "wsp_race";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    const [a, b] = await Promise.all([deliver(job), deliver(job)]);

    expect(memorySesTransport.sent).toHaveLength(1);
    const outcomes = [a.outcomes[0], b.outcomes[0]];
    expect(outcomes.filter((o) => o.kind === "ack")).toHaveLength(1);
    const busy = outcomes.find((o) => o.kind === "retry");
    expect(busy?.kind === "retry" && busy.delaySeconds).toBeGreaterThanOrEqual(1);
    expect(busy?.kind === "retry" && busy.delaySeconds).toBeLessThanOrEqual(60);
  });

  it("retries a retryable SES failure with backoff and sends on the next delivery", async () => {
    const ws = "wsp_retry";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    memorySesTransport.failNext(new AwsError("Throttling", "slow", { status: 429 }));

    const first = await deliver(job);
    expect(first.outcomes).toEqual([{ kind: "retry", delaySeconds: 30 }]);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({
      status: "queued",
      attempts: 1,
      error: "slow",
      claimedUntil: null,
    });

    const second = await deliver(job);
    expect(second.outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(1);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("fails a permanent SES rejection and acks", async () => {
    const ws = "wsp_reject";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    memorySesTransport.failNext(new AwsError("MessageRejected", "bad", { status: 400 }));

    const { outcomes } = await deliver(job);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "failed", error: "bad" });
  });

  it("fails the message on the fifth attempt even when the error is retryable", async () => {
    const ws = "wsp_exhaust";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("UPDATE message SET attempts = 4 WHERE id = ?", job.messageId),
    );
    memorySesTransport.failNext(new AwsError("ServiceUnavailable", "down", { status: 503 }));

    const { outcomes } = await deliver(job);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "failed", attempts: 5, error: "down" });
  });

  it("enqueues a finalize job when markSent fails after SES accepted, and counts the send once", async () => {
    const ws = "wsp_marksent";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    failMarkSentOnce();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { outcomes } = await deliver(job);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(1);
    expect(enqueue).toHaveBeenLastCalledWith({ kind: "finalize", workspaceId: ws, messageId: job.messageId, sesMessageId: "mem-1" });

    const recorded = enqueue.mock.calls.at(-1)![0] as SendJob;
    const again = await deliver(recorded);
    expect(again.outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(1);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "sent", sesMessageId: "mem-1" });
    expect(await usageSent(ws)).toBe(1);
  });

  it("finalize job marks the row sent without calling the transport", async () => {
    const ws = "wsp_finalize";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);

    const { outcomes } = await deliver({ kind: "finalize", workspaceId: ws, messageId: job.messageId, sesMessageId: "ses-x" });
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(0);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "sent", sesMessageId: "ses-x" });
  });

  it("does not bump usage again when a finalize job is redelivered", async () => {
    const ws = "wsp_finalize_twice";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    const finalize: SendJob = { kind: "finalize", workspaceId: ws, messageId: job.messageId, sesMessageId: "ses-y" };

    await deliver(finalize);
    const again = await deliver(finalize);
    expect(again.outcomes).toEqual([{ kind: "ack" }]);
    expect(await usageSent(ws)).toBe(1);
  });

  it("acks when the finalize enqueue also fails, logging only the message id", async () => {
    const ws = "wsp_finalize_lost";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    failMarkSentOnce();
    enqueue.mockRejectedValueOnce(new Error("queue down for bob@example.com"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const { outcomes } = await deliver(job);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(1);
    const logged = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(logged).toContain(job.messageId);
    expect(logged).not.toContain("@");
    expect(logged).not.toContain("queue down");
    expect(logged).not.toContain("do unreachable");
  });

  it("stores the SES error with addresses masked and capped at 500 characters", async () => {
    const ws = "wsp_mask";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    memorySesTransport.failNext(new AwsError("MessageRejected", `bad bob@example.com ${"x".repeat(600)}`, { status: 400 }));

    await deliver(job);
    const { error } = (await stub.getMessage(ws, job.messageId))!;
    expect(error).toMatch(/^bad b\*\*\*@example\.com x/);
    expect(error).not.toContain("bob@");
    expect(error!.length).toBe(500);
  });

  it("fails a message whose html object is missing, without retrying or sending", async () => {
    const ws = "wsp_nohtml";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    await env.MAIL.delete((await stub.getMessage(ws, job.messageId))!.htmlKey!);

    const { outcomes } = await deliver(job);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(0);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "failed", error: "html missing", claimedUntil: null });
  });

  it("retries an unexpected failure after 30 seconds", async () => {
    const ws = "wsp_outer";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    vi.spyOn(env.CLIENT, "get").mockImplementation(
      () => ({ claimSend: () => Promise.reject(new Error("do down")) }) as never,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { outcomes } = await deliver(job);
    expect(outcomes).toEqual([{ kind: "retry", delaySeconds: 30 }]);
  });

  it("fails a sender whose region has no SES config set, and acks", async () => {
    const ws = "wsp_region";
    const stub = await seedWorkspace(ws, "eu-west-1");
    const job = await queue(stub, ws);

    const { outcomes } = await deliver(job);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(0);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({
      status: "failed",
      error: "no SES config set for region eu-west-1",
    });
  });

  it("acks a suppressed or missing message without sending", async () => {
    const ws = "wsp_suppressed";
    const stub = await seedWorkspace(ws);
    await stub.addSuppression(ws, "guest@x.com", "unsubscribe");
    const job = await queue(stub, ws);
    const missing: SendJob = { workspaceId: ws, messageId: "msg_missing" };

    const { outcomes } = await deliver(job, missing);
    expect(outcomes).toEqual([{ kind: "ack" }, { kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(0);
  });

  it("does not send a queued message whose recipient was suppressed while it waited", async () => {
    const ws = "wsp_claim_suppressed";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    const htmlKey = (await stub.getMessage(ws, job.messageId))!.htmlKey!;
    await stub.addSuppression(ws, "guest@x.com", "bounce");

    const { outcomes } = await deliver(job);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(0);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "suppressed", htmlKey: null, claimedUntil: null });
    expect(await env.MAIL.get(htmlKey)).toBeNull();
  });

  it("acks a job of an unknown kind without touching the send path", async () => {
    const ws = "wsp_bogus_kind";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { outcomes } = await deliver({ kind: "bogus", workspaceId: ws, messageId: job.messageId } as never);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(0);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "queued", attempts: 0 });
  });

  it("retries only a job without a workspaceId and still sends the valid job in the same batch", async () => {
    const ws = "wsp_bad_job";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { sent, outcomes } = await deliver({ messageId: "msg_orphan" } as never, job);
    expect(outcomes).toEqual([{ kind: "retry", delaySeconds: 30 }, { kind: "ack" }]);
    expect(sent).toBe(1);
    expect(memorySesTransport.sent).toHaveLength(1);
  });

  it("fails a queued message whose workspace was suspended after it was queued, and drops its html", async () => {
    const ws = "wsp_claim_suspend";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    await setWorkspaceStatus(env, { userId: "usr_ops_test" }, ws, "suspended");

    const { outcomes } = await deliver(job);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(0);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "failed", error: "workspace_suspended", claimedUntil: null });
    expect(await env.MAIL.get(`ws/${ws}/msg/${job.messageId}.html`)).toBeNull();
  });

  it("fails a queued message whose sender stopped being verified after it was queued", async () => {
    const ws = "wsp_claim_sender";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    await coreDb(env).update(address).set({ canSend: false }).where(eq(address.email, "orders@tiffingrab.ca"));
    await refreshWorkspaceLimits(env, ws);

    const { outcomes } = await deliver(job);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(0);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "failed", error: "sender_not_verified" });
  });

  it("answers busy and keeps the message queued when limits cannot be loaded and none are cached", async () => {
    const ws = "wsp_claim_no_limits";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    await runInDurableObject(stub, (_instance, state) => state.storage.kv.delete("limits"));
    vi.spyOn(env.CORE_DB, "prepare").mockImplementation(() => {
      throw new Error("D1 down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await stub.claimSend(ws, job.messageId)).toEqual({ kind: "busy", retryInSeconds: 60 });
    vi.restoreAllMocks();
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "queued", attempts: 0 });
  });

  it("acks a duplicate of a sent message after its workspace is suspended, without loading limits or failing it", async () => {
    const ws = "wsp_claim_sent_suspend";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws);
    await deliver(job);
    await setWorkspaceStatus(env, { userId: "usr_ops_test" }, ws, "suspended");
    vi.spyOn(env.CORE_DB, "prepare").mockImplementation(() => {
      throw new Error("D1 down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { outcomes } = await deliver(job);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(1);
    vi.restoreAllMocks();
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "sent" });
  });
});
