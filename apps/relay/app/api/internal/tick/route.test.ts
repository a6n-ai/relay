import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workerTick = vi.fn();
const nextDueAt = vi.fn();
const scheduleWake = vi.fn();
vi.mock("@/lib/notifications/drain", () => ({ workerTick: () => workerTick() }));
vi.mock("@/lib/notifications/next-due", () => ({ nextDueAt: () => nextDueAt() }));
vi.mock("@/lib/runtime/wake", () => ({ scheduleWake: (at: number) => scheduleWake(at) }));

const { POST } = await import("./route");

const call = (auth?: string) =>
  POST(new Request("https://internal/api/internal/tick", { method: "POST", headers: auth ? { authorization: auth } : {} }));

describe("POST /api/internal/tick", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    workerTick.mockResolvedValue({ campaigns: 0, drained: 2, webhooks: 1 });
    nextDueAt.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
  });

  it("rejects a missing bearer without draining", async () => {
    expect((await call()).status).toBe(401);
    expect(workerTick).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer", async () => {
    expect((await call("Bearer nope")).status).toBe(401);
    expect(workerTick).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer ")).status).toBe(401);
    expect(workerTick).not.toHaveBeenCalled();
  });

  it("drains and reports how long until the next item is due", async () => {
    nextDueAt.mockResolvedValue(Date.now() + 90_000);
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { drained: number; retryAfterMs: number };
    expect(body.drained).toBe(2);
    expect(body.retryAfterMs).toBeGreaterThan(80_000);
    expect(body.retryAfterMs).toBeLessThanOrEqual(90_000);
  });

  it("always books the next wake while something is waiting, so the chain never stalls", async () => {
    const at = Date.now() + 90_000;
    nextDueAt.mockResolvedValue(at);
    await call("Bearer s3cret");
    expect(scheduleWake).toHaveBeenCalledWith(at);
  });

  it("books no wake when nothing is waiting", async () => {
    await call("Bearer s3cret");
    expect(scheduleWake).not.toHaveBeenCalled();
  });

  it("returns null when nothing is waiting", async () => {
    const body = (await (await call("Bearer s3cret")).json()) as { retryAfterMs: number | null };
    expect(body.retryAfterMs).toBeNull();
  });

  it("books a wake when the next item is beyond the queue's 12 h delay cap", async () => {
    const at = Date.now() + 13 * 3_600_000;
    nextDueAt.mockResolvedValue(at);
    await call("Bearer s3cret");
    expect(scheduleWake).toHaveBeenCalledWith(at);
  });
});
