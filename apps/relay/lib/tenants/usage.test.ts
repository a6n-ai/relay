import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({ wheres: [] as unknown[] }));

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (where: unknown) => {
          state.wheres.push(where);
          return { groupBy: async () => [{ tenantId: 7n, n: 3 }] };
        },
      }),
    }),
  },
}));

import { countTenantSendsThisMonth } from "./usage";

describe("countTenantSendsThisMonth", () => {
  it("counts only sent mail, so queued or failed sends never use up a quota", async () => {
    expect(await countTenantSendsThisMonth(7n)).toBe(3);
    const { params } = new PgDialect().sqlToQuery(state.wheres[0] as SQL);
    expect(params).toContain("sent");
  });
});
