import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  wheres: [] as SQL[],
  selects: 0,
}));

vi.mock("@/db/client", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    from: self,
    groupBy: self,
    orderBy: self,
    limit: self,
    where: (w: SQL) => {
      state.wheres.push(w);
      return chain;
    },
    then: (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.rows).then(resolve, reject),
  });
  return {
    db: {
      select: () => {
        state.selects += 1;
        return chain;
      },
    },
  };
});

const { loadHomeMetrics } = await import("./load-home-metrics");

function params(where: SQL) {
  return new PgDialect().sqlToQuery(where).params;
}

describe("home metrics scoped to the workspace's apps", () => {
  beforeEach(() => {
    state.rows = [{ tenantCount: 2 }];
    state.wheres = [];
    state.selects = 0;
  });

  it("scopes every query to the given tenants", async () => {
    await loadHomeMetrics([7n, 9n]);
    expect(state.wheres).toHaveLength(4);
    for (const where of state.wheres) {
      expect(params(where)).toEqual(expect.arrayContaining([7n, 9n]));
    }
  });

  it("returns zeros without tenants", async () => {
    const metrics = await loadHomeMetrics([]);
    expect(state.selects).toBe(0);
    expect(metrics).toMatchObject({ tenantCount: 0, pendingCount: 0, failedCount: 0, recent: [] });
  });
});
