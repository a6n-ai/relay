import { describe, expect, it, vi } from "vitest";
import { createRateLimiter, runSignalLoop } from "./drain";

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

describe("runSignalLoop", () => {
  const fast = { settleMs: 0, errorBackoffMs: 0, log: noopLog };

  it("drains once on start, before any signal", async () => {
    const controller = new AbortController();
    const drain = vi.fn(async () => 0);
    const waitForSignal = vi.fn(async () => {
      controller.abort();
      return false;
    });
    await runSignalLoop({ ...fast, signal: controller.signal, drain, waitForSignal });
    expect(drain).toHaveBeenCalledTimes(1);
  });

  it("drains on a signal and not on a timeout", async () => {
    const controller = new AbortController();
    const waits = [true, false, false, true];
    const waitForSignal = vi.fn(async () => {
      const next = waits.shift();
      if (waits.length === 0) controller.abort();
      return next ?? false;
    });
    const drain = vi.fn(async () => 0);
    await runSignalLoop({ ...fast, signal: controller.signal, drain, waitForSignal });
    // startup drain + the first signal; the last signal lands after abort.
    expect(drain).toHaveBeenCalledTimes(2);
  });

  it("keeps waiting after a drain throws", async () => {
    const controller = new AbortController();
    let calls = 0;
    const drain = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient database blip");
      if (calls >= 3) controller.abort();
      return 0;
    });
    await runSignalLoop({ ...fast, signal: controller.signal, drain, waitForSignal: async () => true });
    expect(calls).toBe(3);
  });

  it("survives the signal store being down", async () => {
    const controller = new AbortController();
    let waits = 0;
    const waitForSignal = vi.fn(async () => {
      waits += 1;
      if (waits === 1) throw new Error("ECONNREFUSED");
      controller.abort();
      return true;
    });
    const drain = vi.fn(async () => 0);
    await runSignalLoop({ ...fast, signal: controller.signal, drain, waitForSignal });
    expect(waitForSignal).toHaveBeenCalledTimes(2);
  });

  it("does not wait at all once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const waitForSignal = vi.fn(async () => true);
    await runSignalLoop({ ...fast, signal: controller.signal, drain: async () => 0, waitForSignal });
    expect(waitForSignal).not.toHaveBeenCalled();
  });
});
