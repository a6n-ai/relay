import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { consumeInbound, consumeInboundDlq, postInternal } from "./inbound-consumer.js";

const body = { rawId: "r1", rawKey: "mail/in/2026/11/r1.eml", envelopeFrom: "a@x.test", envelopeTo: "h@a6n.ai", authResults: null, receivedAt: 1 };

const msg = (attempts: number) => ({ body, attempts, ack: vi.fn(), retry: vi.fn() });
const ok = () => new Response("{}");
const status = (s: number) => new Response("x", { status: s });

describe("consumeInbound", () => {
  it("acks when the app accepts the letter", async () => {
    const m = msg(1);
    const post = vi.fn(async () => ok());
    await consumeInbound({ messages: [m] }, post);
    expect(post).toHaveBeenCalledWith("queued", body);
    expect(m.ack).toHaveBeenCalled();
    expect(m.retry).not.toHaveBeenCalled();
  });

  it("retries attempts 1 to 4 with delays of 30, 60, 120 and 240 seconds", async () => {
    const post = vi.fn(async () => status(500));
    const delays = [];
    for (const attempts of [1, 2, 3, 4]) {
      const m = msg(attempts);
      await consumeInbound({ messages: [m] }, post);
      delays.push(m.retry.mock.calls[0][0].delaySeconds);
      expect(m.ack).not.toHaveBeenCalled();
    }
    expect(delays).toEqual([30, 60, 120, 240]);
    expect(post).not.toHaveBeenCalledWith("failed", expect.anything());
  });

  it("records the failure with its error on attempt 5 and acks", async () => {
    const m = msg(5);
    const post = vi.fn(async (path: string) => (path === "queued" ? status(500) : ok()));
    await consumeInbound({ messages: [m] }, post);
    expect(post).toHaveBeenLastCalledWith("failed", {
      message: body,
      attempts: 5,
      error: "queued 500",
    });
    expect(m.ack).toHaveBeenCalled();
    expect(m.retry).not.toHaveBeenCalled();
  });

  it("does not ack on attempt 5 when recording the failure fails, so the DLQ takes it", async () => {
    const m = msg(5);
    const post = vi.fn(async () => status(500));
    await consumeInbound({ messages: [m] }, post);
    expect(m.ack).not.toHaveBeenCalled();
    expect(m.retry).toHaveBeenCalledWith();
  });

  it("treats a thrown post as a failed attempt", async () => {
    const m = msg(2);
    const post = vi.fn(async () => {
      throw new Error("binding down");
    });
    await consumeInbound({ messages: [m] }, post);
    expect(m.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  });
});

describe("consumeInboundDlq", () => {
  it("posts failed without an error and acks on 200", async () => {
    const m = msg(5);
    const post = vi.fn(async () => ok());
    await consumeInboundDlq({ messages: [m] }, post);
    expect(post).toHaveBeenCalledWith("failed", { message: body, attempts: 5 });
    expect(m.ack).toHaveBeenCalled();
  });

  it("retries when recording the failure fails", async () => {
    const m = msg(6);
    await consumeInboundDlq({ messages: [m] }, vi.fn(async () => status(500)));
    expect(m.ack).not.toHaveBeenCalled();
    expect(m.retry).toHaveBeenCalled();
  });
});

describe("postInternal", () => {
  it("posts the JSON body signed with MAILBOX_INBOUND_SECRET", async () => {
    const fetch = vi.fn(async () => ok());
    await postInternal({ MAILBOX_INBOUND_SECRET: "k", WORKER_SELF_REFERENCE: { fetch } }, "queued", body);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://internal/api/internal/mailbox/inbound/queued");
    expect(init.body).toBe(JSON.stringify(body));
    expect((init.headers as Record<string, string>)["x-relay-signature"]).toBe(
      createHmac("sha256", "k").update(JSON.stringify(body)).digest("hex"),
    );
  });
});
