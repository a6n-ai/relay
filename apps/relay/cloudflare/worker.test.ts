import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  consumeInbound: vi.fn(),
  consumeInboundDlq: vi.fn(),
  postInternal: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("../.open-next/worker.js", () => ({ default: { fetch: vi.fn() } }));
vi.mock("./bootstrap.js", () => ({ bootOnce: vi.fn() }));
vi.mock("./email.js", () => ({ receive: vi.fn() }));
vi.mock("./workflows.js", () => ({ RelayWake: class {} }));
vi.mock("./inbound-consumer.js", () => ({
  consumeInbound: h.consumeInbound,
  consumeInboundDlq: h.consumeInboundDlq,
  postInternal: h.postInternal,
}));
vi.mock("./queue-consumer.js", () => ({ consume: h.consume }));

const { default: worker } = await import("./worker.js");

const env = { WORKER_SELF_REFERENCE: { fetch: vi.fn(async () => Response.json({ retryAfterMs: null })) }, CRON_SECRET: "c" };
const batch = (queue: string) => ({ queue, messages: [] });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("queue", () => {
  it("routes relay-inbound to consumeInbound with the signed poster", async () => {
    const b = batch("relay-inbound");
    await worker.queue(b, env);
    expect(h.consumeInbound).toHaveBeenCalledWith(b, expect.any(Function));
    expect(h.consume).not.toHaveBeenCalled();

    const post = h.consumeInbound.mock.calls[0][1];
    await post("queued", { rawId: "r" });
    expect(h.postInternal).toHaveBeenCalledWith(env, "queued", { rawId: "r" });
  });

  it("routes relay-inbound-dlq to consumeInboundDlq", async () => {
    const b = batch("relay-inbound-dlq");
    await worker.queue(b, env);
    expect(h.consumeInboundDlq).toHaveBeenCalledWith(b, expect.any(Function));
    expect(h.consumeInbound).not.toHaveBeenCalled();
    expect(h.consume).not.toHaveBeenCalled();
  });

  it("still drains relay-outbox through the tick", async () => {
    const b = batch("relay-outbox");
    await worker.queue(b, env);
    expect(h.consume).toHaveBeenCalledWith(b, expect.any(Function));
    expect(h.consumeInbound).not.toHaveBeenCalled();

    const runTick = h.consume.mock.calls[0][1];
    await runTick();
    expect(env.WORKER_SELF_REFERENCE.fetch).toHaveBeenCalledWith(
      "https://internal/api/internal/tick",
      expect.objectContaining({ method: "POST", headers: { authorization: "Bearer c" } }),
    );
  });
});
