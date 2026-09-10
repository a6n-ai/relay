import { describe, expect, it, vi } from "vitest";
import { createRateLimiter, runDrainLoop } from "./drain";

const noopLog = { info: () => {}, error: () => {} };

describe("createRateLimiter", () => {
  it("allows a full bucket to drain without waiting", async () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter(10, () => Date.now());
    const started = Date.now();
    for (let i = 0; i < 10; i++) await limiter.take();
    expect(Date.now() - started).toBe(0);
    vi.useRealTimers();
  });

  it("reports the wait needed once the bucket is empty", () => {
    let now = 0;
    const limiter = createRateLimiter(10, () => now);
    for (let i = 0; i < 10; i++) limiter.tryTake();
    expect(limiter.tryTake()).toBe(false);
    now += 100; // one token refills at 10/s
    expect(limiter.tryTake()).toBe(true);
  });

  it("never accumulates more than one second of tokens", () => {
    let now = 0;
    const limiter = createRateLimiter(5, () => now);
    now += 60_000;
    let taken = 0;
    while (limiter.tryTake()) taken++;
    expect(taken).toBe(5);
  });
});

describe("runDrainLoop", () => {
  it("keeps looping after a drain throws", async () => {
    const controller = new AbortController();
    let calls = 0;
    const drain = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient database blip");
      if (calls >= 3) controller.abort();
      return 0;
    });

    await runDrainLoop({
      intervalMs: 0,
      signal: controller.signal,
      drain,
      materialize: async () => 0,
      log: noopLog,
    });
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it("stops when the signal aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const drain = vi.fn(async () => 0);
    await runDrainLoop({
      intervalMs: 0,
      signal: controller.signal,
      drain,
      materialize: async () => 0,
      log: noopLog,
    });
    expect(drain).not.toHaveBeenCalled();
  });

  it("materializes due campaigns before draining", async () => {
    const controller = new AbortController();
    const order: string[] = [];
    const materialize = vi.fn(async () => {
      order.push("materialize");
      return 0;
    });
    const drain = vi.fn(async () => {
      order.push("drain");
      controller.abort();
      return 0;
    });

    await runDrainLoop({ intervalMs: 0, signal: controller.signal, drain, materialize, log: noopLog });
    expect(order).toEqual(["materialize", "drain"]);
  });

  it("still drains when campaign materialization throws", async () => {
    const controller = new AbortController();
    const materialize = vi.fn(async () => {
      throw new Error("segment query blew up");
    });
    const drain = vi.fn(async () => {
      controller.abort();
      return 0;
    });

    await runDrainLoop({ intervalMs: 0, signal: controller.signal, drain, materialize, log: noopLog });
    expect(drain).toHaveBeenCalled();
  });
});
