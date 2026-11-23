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
    await listSends({ tenantIds: [7n, 9n], includeOperatorMail: false, mailboxIds: "all" });

    const { sql, params } = render(state.wheres[0]);
    expect(params).toEqual(expect.arrayContaining([7n, 9n]));
    expect(sql).not.toContain("is null");
  });

  it("includes operator mail only in the platform workspace", async () => {
    await listSends({ tenantIds: [7n], includeOperatorMail: true, mailboxIds: "all" });

    expect(render(state.wheres[0]).sql).toContain("is null");
  });

  it("members limited by grants see only sends from their granted mailboxes", async () => {
    await listSends({ tenantIds: [7n], includeOperatorMail: false, mailboxIds: [42n] });

    const { sql, params } = render(state.wheres[0]);
    expect(sql).toContain("exists (select 1 from \"email_mailbox\"");
    expect(params).toEqual(expect.arrayContaining([7n, 42n]));
  });

  it("full mailbox access adds no grant filter", async () => {
    await listSends({ tenantIds: [7n], includeOperatorMail: false, mailboxIds: "all" });

    expect(render(state.wheres[0]).sql).not.toContain("email_mailbox");
  });

  it("no granted mailboxes shows no sends without querying", async () => {
    await expect(listSends({ tenantIds: [7n], includeOperatorMail: false, mailboxIds: [] })).resolves.toEqual([]);
    expect(state.selects).toBe(0);
  });

  it("no apps shows no sends without querying", async () => {
    state.rows = [{ publicId: "x" }];

    await expect(listSends({ tenantIds: [], includeOperatorMail: false, mailboxIds: "all" })).resolves.toEqual([]);
    expect(state.selects).toBe(0);
  });
});
