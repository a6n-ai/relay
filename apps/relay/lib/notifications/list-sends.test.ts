import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  selects: 0,
  wheres: [] as unknown[],
  rows: [] as unknown[],
}));

vi.mock("@/db/client", () => ({
  db: {
    select: () => {
      state.selects++;
      return {
        from: () => ({
          where: (where: unknown) => {
            state.wheres.push(where);
            return { orderBy: () => ({ limit: async () => state.rows }) };
          },
        }),
      };
    },
  },
}));

import { listSends } from "./list-sends";

function render(where: unknown) {
  return new PgDialect().sqlToQuery(where as SQL);
}

describe("listSends", () => {
  beforeEach(() => {
    state.selects = 0;
    state.wheres = [];
    state.rows = [];
  });

  it("sends list is scoped to the workspace's apps", async () => {
    await listSends({ tenantIds: [7n, 9n], includeOperatorMail: false });

    const { sql, params } = render(state.wheres[0]);
    expect(params).toEqual(expect.arrayContaining([7n, 9n]));
    expect(sql).not.toContain("is null");
  });

  it("includes operator mail only in the platform workspace", async () => {
    await listSends({ tenantIds: [7n], includeOperatorMail: true });

    expect(render(state.wheres[0]).sql).toContain("is null");
  });

  it("no apps shows no sends without querying", async () => {
    state.rows = [{ publicId: "x" }];

    await expect(listSends({ tenantIds: [], includeOperatorMail: false })).resolves.toEqual([]);
    expect(state.selects).toBe(0);
  });
});
