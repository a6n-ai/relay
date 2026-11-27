import { env, runInDurableObject } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { handleInboundBatch, MAX_INBOUND_ATTEMPTS } from "../src/core/inbound-consumer";
import { utcDay } from "../src/core/usage";
import { coreDb } from "../src/db/core/client";
import { usageDaily } from "../src/db/core/schema";
import type { InboundJob } from "../src/env";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

afterEach(() => {
  vi.restoreAllMocks();
});

type Outcome = { kind: "none" } | { kind: "ack" } | { kind: "retry"; delaySeconds?: number };

// Hand-made batch: records the ack or retry each message receives.
function batchOf(bodies: unknown[], attempts = 1) {
  const outcomes: Outcome[] = bodies.map((): Outcome => ({ kind: "none" }));
  const messages = bodies.map((body, i) => ({
    id: `job-${i}`,
    timestamp: new Date(),
    body,
    attempts,
    ack: () => {
      outcomes[i] = { kind: "ack" };
    },
    retry: (opts?: { delaySeconds?: number }) => {
      outcomes[i] = { kind: "retry", delaySeconds: opts?.delaySeconds };
    },
  }));
  return { batch: { queue: "relay-inbound-mail", messages } as never, outcomes };
}

const eml = (lines: string[]) => new TextEncoder().encode(lines.join("\r\n")).buffer as ArrayBuffer;

async function putLetter(workspaceId: string): Promise<InboundJob> {
  const rawKey = `ws/${workspaceId}/raw/2026/11/${crypto.randomUUID()}.eml`;
  const letter = eml([
    "From: cust@example.com",
    "To: info@tiffingrab.ca",
    "Subject: Hello",
    `Message-ID: <${crypto.randomUUID()}@x>`,
    "Date: Tue, 01 Jul 2025 10:00:00 +0000",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Body text",
  ]);
  await env.MAIL.put(rawKey, letter);
  return {
    workspaceId,
    appId: "app_A",
    addressId: "add_1",
    rawKey,
    envelopeFrom: "bounce@example.com",
    envelopeTo: "relay@tiffingrab.ca",
    authResults: "mx; dmarc=pass",
    receivedAt: 1_700_000_000_000,
  };
}

async function inboundCount(workspaceId: string, receivedAt: number): Promise<number> {
  const [row] = await coreDb(env)
    .select({ inbound: usageDaily.inbound })
    .from(usageDaily)
    .where(and(eq(usageDaily.workspaceId, workspaceId), eq(usageDaily.day, utcDay(receivedAt))));
  return row?.inbound ?? 0;
}

async function inboundFailures(workspaceId: string, rawKey: string): Promise<string[]> {
  const stub = env.CLIENT.get(env.CLIENT.idFromName(workspaceId));
  const rows = await runInDurableObject(stub, (_instance, state) =>
    state.storage.sql.exec("SELECT error FROM inbound_failure WHERE raw_key = ?", rawKey).toArray(),
  );
  return rows.map((row) => row.error as string);
}

describe("relay-inbound-mail consumer", () => {
  it("acks a stored letter, bumps usage once, and acks a redelivery without bumping again", async () => {
    const ws = "wsp_inb_ok";
    const job = await putLetter(ws);
    const first = batchOf([job]);
    await handleInboundBatch(first.batch, env);
    expect(first.outcomes).toEqual([{ kind: "ack" }]);
    expect(await inboundCount(ws, job.receivedAt)).toBe(1);

    const again = batchOf([job]);
    await handleInboundBatch(again.batch, env);
    expect(again.outcomes).toEqual([{ kind: "ack" }]);
    expect(await inboundCount(ws, job.receivedAt)).toBe(1);
  });

  it("retries a missing raw letter with a 30 second delay before the last attempt", async () => {
    const ws = "wsp_inb_retry";
    const job = { ...(await putLetter(ws)), rawKey: `ws/${ws}/raw/2026/11/missing.eml` };
    const { batch, outcomes } = batchOf([job], 1);
    await handleInboundBatch(batch, env);
    expect(outcomes).toEqual([{ kind: "retry", delaySeconds: 30 }]);
    expect(await inboundCount(ws, job.receivedAt)).toBe(0);
  });

  it("writes an inbound_failure and acks at the last attempt", async () => {
    const ws = "wsp_inb_final";
    const job = { ...(await putLetter(ws)), rawKey: `ws/${ws}/raw/2026/11/missing.eml` };
    const { batch, outcomes } = batchOf([job], MAX_INBOUND_ATTEMPTS);
    await handleInboundBatch(batch, env);
    expect(outcomes).toEqual([{ kind: "ack" }]);
    expect(await inboundFailures(ws, job.rawKey)).toEqual(["Processing failed"]);
  });

  it("acks a malformed body without failing the batch", async () => {
    const ws = "wsp_inb_bad";
    const good = await putLetter(ws);
    const { batch, outcomes } = batchOf([null, { foo: 1 }, { workspaceId: ws }, good]);
    await expect(handleInboundBatch(batch, env)).resolves.toBeUndefined();
    expect(outcomes.slice(0, 3)).toEqual([{ kind: "ack" }, { kind: "ack" }, { kind: "ack" }]);
    expect(outcomes[3]).toEqual({ kind: "ack" });
  });

  it("never logs an address or subject", async () => {
    const ws = "wsp_inb_log";
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const job = { ...(await putLetter(ws)), rawKey: `ws/${ws}/raw/2026/11/missing.eml` };
    const { batch } = batchOf([job, null], MAX_INBOUND_ATTEMPTS);
    await handleInboundBatch(batch, env);
    expect(errors).toHaveBeenCalled();
    for (const call of errors.mock.calls) expect(JSON.stringify(call)).not.toContain("@");
  });
});
