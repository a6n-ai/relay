import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@/db/client", () => ({ db: { execute: (q: SQL) => execute(q) } }));

const { nextDueAt } = await import("./next-due");

describe("nextDueAt", () => {
  beforeEach(() => execute.mockReset());

  it("returns the earliest due time across outbox, webhooks and scheduled campaigns", async () => {
    execute.mockResolvedValue([{ at: "3000" }]);
    expect(await nextDueAt()).toBe(3000);
    const { sql } = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(sql).toMatch(/least\(/i);
    expect(sql).toContain('"notification_outbox"');
    expect(sql).toContain('"tenant_webhook_delivery"');
    expect(sql).toContain('"campaign"');
    expect(sql.match(/= 'pending'/g)).toHaveLength(2);
    expect(sql).toContain("= 'scheduled'");
  });

  it("is null when nothing is waiting", async () => {
    execute.mockResolvedValue([{ at: null }]);
    expect(await nextDueAt()).toBeNull();
  });
});
