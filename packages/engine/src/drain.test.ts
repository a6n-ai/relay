import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./drain";

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

async function outboxTables() {
  const { bigint, pgEnum, pgTable } = await import("drizzle-orm/pg-core");
  const { makeNotificationTables } = await import("./schema");
  return makeNotificationTables({
    users: pgTable("users", { id: bigint("id", { mode: "bigint" }).primaryKey() }),
    appEvent: pgEnum("app_event", ["test"]),
    locale: pgEnum("locale", ["en"]),
  });
}

describe("claim lease", () => {
  it("claims pending rows and rows whose processing lease ran out, once due", async () => {
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const { claimableWhere } = await import("./drain");
    const o = (await outboxTables()).notificationOutbox;
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
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const { leaseHeld } = await import("./drain");
    const o = (await outboxTables()).notificationOutbox;
    const { sql, params } = new PgDialect().sqlToQuery(leaseHeld(o, 7n, 301_000)!);
    expect(sql).toContain('"id" =');
    expect(sql).toContain('"status" =');
    expect(sql).toContain('"next_attempt_at" =');
    expect(params).toEqual(expect.arrayContaining([7n, "processing", 301_000]));
  });
});

describe("beforeSend", () => {
  async function drainOneRow(beforeSend: () => Promise<string | null>) {
    const { drainOnce } = await import("./drain");
    const tables = await outboxTables();
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
