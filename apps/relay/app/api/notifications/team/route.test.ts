import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  workspace: { id: "org_a", slug: "a" } as { id: string; slug: string } | null,
  where: null as SQL | null,
  rows: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/campaigns/http", () => ({ operatorGuard: async () => {} }));
vi.mock("@/lib/mailbox/scope", () => ({ workspaceSlug: async () => state.workspace }));
vi.mock("@/db/client", () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: (w: SQL) => {
      state.where = w;
      return chain;
    },
    orderBy: async () => state.rows,
  };
  return { db: { select: () => chain } };
});

const { GET } = await import("./route");

describe("GET /api/notifications/team", () => {
  beforeEach(() => {
    state.workspace = { id: "org_a", slug: "a" };
    state.where = null;
    state.rows = [
      { publicId: "usr_1", email: "a@x.com", name: "A", role: "owner", status: "active", createdAt: 1 },
    ];
  });

  it("lists only members of the active workspace", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { publicId: "usr_1", email: "a@x.com", name: "A", role: "owner", status: "active", createdAt: 1 },
    ]);
    const q = new PgDialect().sqlToQuery(state.where!);
    expect(q.sql).toContain('"organization_id"');
    expect(q.params).toEqual(["org_a"]);
  });

  it("returns 404 without an active workspace membership", async () => {
    state.workspace = null;
    const res = await GET();
    expect(res.status).toBe(404);
    expect(state.where).toBeNull();
  });
});
