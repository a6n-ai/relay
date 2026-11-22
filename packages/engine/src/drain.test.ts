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

describe("claim lease", () => {
  it("claims pending rows and rows whose processing lease ran out, once due", async () => {
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const { claimableWhere } = await import("./drain");
    const { bigint, pgTable, text } = await import("drizzle-orm/pg-core");
    const { makeTenantNotificationTables } = await import("./tenant-schema");
    const tenants = pgTable("tenants", { id: bigint("id", { mode: "bigint" }).primaryKey() });
    const mailboxes = pgTable("tenant_mailboxes", { id: bigint("id", { mode: "bigint" }).primaryKey(), tenantId: bigint("tenant_id", { mode: "bigint" }), email: text("email") });
    const o = makeTenantNotificationTables({ tenants, mailboxes }).notificationOutbox;
    const { sql, params } = new PgDialect().sqlToQuery(claimableWhere(o, 1000)!);
    expect(sql).toMatch(/"status" in \(\$\d+, \$\d+\)/);
    expect(params).toEqual(expect.arrayContaining(["pending", "processing", 1000]));
    expect(sql).toContain('"next_attempt_at" <=');
  });

  it("leases a claimed row so a tick cut off mid-send frees it again", async () => {
    const { CLAIM_LEASE_MS, claimLease } = await import("./drain");
    expect(CLAIM_LEASE_MS).toBe(5 * 60_000);
    expect(claimLease(1000)).toEqual({ status: "processing", nextAttemptAt: 1000 + 5 * 60_000 });
  });
});

describe("claim retry cap and fencing", () => {
  it("fails a reclaimed row that already used all its attempts instead of sending it again", async () => {
    const { splitExhausted } = await import("./drain");
    const rows = [
      { id: 1n, status: "pending", attempts: 4 },
      { id: 2n, status: "processing", attempts: 5 },
      { id: 3n, status: "processing", attempts: 2 },
    ];
    const { deliver, exhausted } = splitExhausted(rows, 5);
    expect(deliver.map((r) => r.id)).toEqual([1n, 3n]);
    expect(exhausted.map((r) => r.id)).toEqual([2n]);
  });

  it("writes a send's outcome only while this tick still holds the row's lease", async () => {
    const { PgDialect, bigint, pgTable, text } = await import("drizzle-orm/pg-core");
    const { leaseHeld } = await import("./drain");
    const { makeTenantNotificationTables } = await import("./tenant-schema");
    const tenants = pgTable("tenants", { id: bigint("id", { mode: "bigint" }).primaryKey() });
    const mailboxes = pgTable("tenant_mailboxes", { id: bigint("id", { mode: "bigint" }).primaryKey(), tenantId: bigint("tenant_id", { mode: "bigint" }), email: text("email") });
    const o = makeTenantNotificationTables({ tenants, mailboxes }).notificationOutbox;
    const { sql, params } = new PgDialect().sqlToQuery(leaseHeld(o, 7n, 301_000)!);
    expect(sql).toContain('"id" =');
    expect(sql).toContain('"status" =');
    expect(sql).toContain('"next_attempt_at" =');
    expect(params).toEqual(expect.arrayContaining([7n, "processing", 301_000]));
  });
});

describe("beforeSend", () => {
  async function drainOneRow(beforeSend: () => Promise<string | null>) {
    const { bigint, pgTable, text } = await import("drizzle-orm/pg-core");
    const { drainOnce } = await import("./drain");
    const { makeTenantNotificationTables } = await import("./tenant-schema");
    const tenants = pgTable("tenants", { id: bigint("id", { mode: "bigint" }).primaryKey() });
    const mailboxes = pgTable("tenant_mailboxes", { id: bigint("id", { mode: "bigint" }).primaryKey(), tenantId: bigint("tenant_id", { mode: "bigint" }), email: text("email") });
    const tables = makeTenantNotificationTables({ tenants, mailboxes });
    const row = { id: 1n, tenantId: 1n, channel: "email", kind: "transactional", status: "pending", attempts: 0, nextAttemptAt: 0 };
    const writes: Record<string, unknown>[] = [];
    const rowsOf = (value: unknown[]) => {
      const c: Record<string, unknown> = { then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(value).then(ok, bad) };
      for (const m of ["from", "where", "orderBy", "limit", "for"]) c[m] = () => c;
      return c;
    };
    const write = (values: Record<string, unknown>) => {
      writes.push(values);
      return { where: () => Object.assign(Promise.resolve([]), { returning: async () => [{ id: 1n }] }) };
    };
    const db = {
      transaction: async (fn: (tx: unknown) => unknown) => fn({ select: () => rowsOf([row]), update: () => ({ set: write }) }),
      update: () => ({ set: write }),
    };
    const handler = vi.fn(async () => ({ providerMessageId: "p1" }));
    const onProcessed = vi.fn(async () => {});
    await drainOnce({ db, tables, handlers: { email: handler }, beforeSend, onProcessed } as never, 25);
    return { handler, onProcessed, writes };
  }

  it("beforeSend refusal fails the row without sending", async () => {
    const reason = "Monthly message quota exceeded";
    const { handler, onProcessed, writes } = await drainOneRow(async () => reason);
    expect(handler).not.toHaveBeenCalled();
    expect(writes).toContainEqual(expect.objectContaining({ status: "failed", lastError: reason }));
    expect(onProcessed).toHaveBeenCalledWith(expect.objectContaining({ id: 1n }), { status: "failed", lastError: reason });
  });

  it("a null beforeSend lets the row send as before", async () => {
    const { handler, onProcessed, writes } = await drainOneRow(async () => null);
    expect(handler).toHaveBeenCalledOnce();
    expect(writes).toContainEqual(expect.objectContaining({ status: "sent", providerMessageId: "p1" }));
    expect(onProcessed).toHaveBeenCalledWith(expect.objectContaining({ id: 1n }), expect.objectContaining({ status: "sent" }));
  });
});
