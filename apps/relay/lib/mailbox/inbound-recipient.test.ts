import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

let rows: { tenantId: bigint }[] = [];
let where: SQL | undefined;
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (w: SQL) => {
          where = w;
          return { limit: async () => rows };
        },
      }),
    }),
  },
}));

const { tenantForInbox } = await import("./inbound-recipient");

describe("tenantForInbox", () => {
  beforeEach(() => {
    rows = [];
    where = undefined;
  });

  it("returns the app that owns the Relay inbox", async () => {
    rows = [{ tenantId: 7n }];
    expect(await tenantForInbox("Hello@A6N.ai")).toBe(7n);
    const { sql, params } = new PgDialect().sqlToQuery(where!);
    expect(sql).toContain('"kind"');
    expect(params).toContain("hello@a6n.ai");
    expect(params).toContain("relay_inbox");
  });

  it("is null for an address no app holds as a Relay inbox", async () => {
    expect(await tenantForInbox("nobody@a6n.ai")).toBeNull();
  });

  it("fails closed when two apps hold the same address", async () => {
    rows = [{ tenantId: 7n }, { tenantId: 8n }];
    expect(await tenantForInbox("hello@a6n.ai")).toBeNull();
  });
});
