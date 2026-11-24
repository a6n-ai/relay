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
async function queue(stub: Awaited<ReturnType<typeof seedWorkspace>>, workspaceId: string, input: Omit<typeof base, "stream"> & { stream: "transactional" | "marketing" } = base) {
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

  it("does not send a queued marketing message whose recipient opted out while it waited", async () => {
    const ws = "wsp_claim_optout";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws, { ...base, stream: "marketing", html: '<a href="{{unsubscribe_url}}">Stop</a>', text: "Stop: {{unsubscribe_url}}" });
    await stub.unsubscribe(ws, job.messageId);

    const { outcomes } = await deliver(job);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent).toHaveLength(0);
    expect(await stub.getMessage(ws, job.messageId)).toMatchObject({ status: "suppressed", claimedUntil: null });
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

describe("unsubscribe link and headers", () => {
  it("adds the signed link and List-Unsubscribe headers to marketing mail only", async () => {
    const ws = "wsp_send_unsub";
    const stub = await seedWorkspace(ws);
    const marketing = await queue(stub, ws, { ...base, stream: "marketing", html: '<a href="{{unsubscribe_url}}">Stop</a>', text: "Stop: {{unsubscribe_url}}" });
    const transactional = await queue(stub, ws, { ...base, html: '<a href="{{unsubscribe_url}}">Stop</a>' });
    await deliver(marketing, transactional);

    // deliver runs both jobs concurrently, so find each by content rather than by send order.
    const mail = memorySesTransport.sent.find((m) => m.headers !== undefined);
    const order = memorySesTransport.sent.find((m) => m.headers === undefined);
    expect(mail?.html).toContain(`/u/${ws}.${marketing.messageId}.`);
    expect(mail?.text).not.toContain("{{unsubscribe_url}}");
    expect(mail?.headers).toEqual([
      { name: "List-Unsubscribe", value: expect.stringMatching(/^<http:\/\/localhost\/u\/.+>$/) },
      { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
    ]);
    expect(order?.html).toContain("{{unsubscribe_url}}");
    expect(order?.headers).toBeUndefined();
  });

  it("retries a marketing job without spending an attempt when the secret is missing", async () => {
    const ws = "wsp_send_nokey";
    const stub = await seedWorkspace(ws);
    const job = await queue(stub, ws, { ...base, stream: "marketing" });
    const saved = env.UNSUBSCRIBE_SECRET;
    Object.assign(env, { UNSUBSCRIBE_SECRET: undefined });
    try {
      const { outcomes } = await deliver(job);
      expect(outcomes).toEqual([{ kind: "retry", delaySeconds: 30 }]);
    } finally {
      Object.assign(env, { UNSUBSCRIBE_SECRET: saved });
    }
    expect(await runInDurableObject(stub, (_i, state) => state.storage.sql.exec("SELECT attempts FROM message WHERE id = ?", job.messageId).one())).toEqual({ attempts: 0 });
  });
});

describe("campaign messages render at claim", () => {
  const HTML = '<p>Hi {{contact.first_name}}</p><p>{{postal_address}}</p><a href="{{unsubscribe_url}}">Stop</a>';
  const TEXT = "Hi {{contact.first_name}} {{postal_address}} {{unsubscribe_url}}";

  // A campaign row and one queued message as the Workflow writes them: no html_key, no text, merge data only.
  async function campaignMessage(stub: Awaited<ReturnType<typeof seedWorkspace>>, id: string, campaignId: string, firstName: string | null) {
    const merge = JSON.stringify({ email: `${id}@x.com`, firstName, lastName: null });
    await runInDurableObject(stub, (_i, state) => {
      state.storage.sql.exec(
        "INSERT OR IGNORE INTO campaign (id, app_id, name, status, from_email, subject, html, text, postal_address, created_at, updated_at) VALUES (?, 'app_1', 'C', 'sent', 'orders@tiffingrab.ca', 'Hi', ?, ?, '1 Main St', 0, 0)",
        campaignId,
        HTML,
        TEXT,
      );
      state.storage.sql.exec(
        "INSERT INTO message (id, app_id, direction, stream, status, event, campaign_id, from_email, from_name, ses_region, to_email, subject, merge_data, attempts, opens, clicks, created_at, updated_at) VALUES (?, 'app_1', 'out', 'marketing', 'queued', 'campaign', ?, 'orders@tiffingrab.ca', 'TiffinGrab', 'us-east-1', ?, 'Hi', ?, 0, 0, 0, 0, 0)",
        id,
        campaignId,
        `${id}@x.com`,
        merge,
      );
    });
  }

  it("renders the stored campaign per recipient, escaped in HTML, with the unsubscribe link filled", async () => {
    const ws = "wsp_send_campaign";
    const stub = await seedWorkspace(ws);
    const mailGet = vi.spyOn(env.MAIL, "get");
    await campaignMessage(stub, "msg_camp_xss", "cmp_render", "<img src=x onerror=alert(1)>");
    const { sent, outcomes } = await deliver({ workspaceId: ws, messageId: "msg_camp_xss" });

    expect(sent).toBe(1);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(memorySesTransport.sent[0]?.html).toContain("Hi &lt;img src=x onerror=alert(1)&gt;");
    expect(memorySesTransport.sent[0]?.html).toContain(`/u/${ws}.msg_camp_xss.`);
    expect(memorySesTransport.sent[0]?.html).not.toContain("{{unsubscribe_url}}");
    expect(memorySesTransport.sent[0]?.text).toContain("Hi <img src=x onerror=alert(1)> 1 Main St");
    expect(mailGet).not.toHaveBeenCalled();
  });

  it("gives two recipients of one stored campaign their own first names", async () => {
    const ws = "wsp_send_campaign_two";
    const stub = await seedWorkspace(ws);
    await campaignMessage(stub, "msg_camp_ann", "cmp_two", "Ann");
    await campaignMessage(stub, "msg_camp_ben", "cmp_two", "Ben");
    await deliver({ workspaceId: ws, messageId: "msg_camp_ann" }, { workspaceId: ws, messageId: "msg_camp_ben" });

    expect(memorySesTransport.sent.map((m) => m.text)).toEqual([
      expect.stringContaining("Hi Ann 1 Main St"),
      expect.stringContaining("Hi Ben 1 Main St"),
    ]);
  });

  it("fails a campaign message whose campaign row is gone, with template missing", async () => {
    const ws = "wsp_send_campaign_gone";
    const stub = await seedWorkspace(ws);
    await campaignMessage(stub, "msg_camp_gone", "cmp_gone", "Ann");
    await runInDurableObject(stub, (_i, state) => state.storage.sql.exec("DELETE FROM campaign WHERE id = 'cmp_gone'"));
    const { sent } = await deliver({ workspaceId: ws, messageId: "msg_camp_gone" });

    expect(sent).toBe(0);
    expect(memorySesTransport.sent).toHaveLength(0);
    const row = await runInDurableObject(stub, (_i, state) =>
      state.storage.sql.exec<{ status: string; error: string }>("SELECT status, error FROM message WHERE id = 'msg_camp_gone'").one(),
    );
    expect(row).toEqual({ status: "failed", error: "template missing" });
  });
});
