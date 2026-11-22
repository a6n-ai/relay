import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mailboxGrant, member, team, tenantMailboxes } from "@/db/schema";

const h = vi.hoisted(() => ({
  rows: new Map<unknown, unknown[]>(),
  wheres: [] as { table: unknown; cond: SQL }[],
}));

vi.mock("@/db/client", () => {
  const chain = (): Record<string, unknown> => {
    let table: unknown;
    const c: Record<string, unknown> = {
      from: (t: unknown) => {
        table = t;
        return c;
      },
      where: (cond: SQL) => {
        h.wheres.push({ table, cond });
        return c;
      },
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
        Promise.resolve(h.rows.get(table) ?? []).then(ok, bad),
    };
    for (const m of ["innerJoin", "leftJoin", "orderBy", "limit"]) c[m] = () => c;
    return c;
  };
  return { db: { select: () => chain() } };
});

const { loadAccessGrid } = await import("./access-grid");

const dialect = new PgDialect();
function paramsFor(table: unknown): string[] {
  return h.wheres
    .filter((w) => w.table === table)
    .flatMap((w) => dialect.sqlToQuery(w.cond).params.map(String));
}

describe("loadAccessGrid", () => {
  beforeEach(() => {
    h.rows = new Map();
    h.wheres = [];
  });

  it("grid lists only this workspace's mailboxes, teams and active members", async () => {
    h.rows.set(tenantMailboxes, [{ id: 5n, publicId: "tmb_1", email: "help@alpha.test", appName: "Alpha" }]);
    h.rows.set(team, [{ id: "tem_1", name: "Support" }]);
    h.rows.set(member, [{ publicId: "mbr_1", name: "Ana", email: "ana@example.test", role: "member,billing" }]);

    const grid = await loadAccessGrid("org_a");

    expect(grid.mailboxes).toEqual([{ id: 5n, publicId: "tmb_1", email: "help@alpha.test", appName: "Alpha" }]);
    expect(grid.columns).toEqual([
      { kind: "team", teamId: "tem_1", label: "Support" },
      { kind: "member", memberPublicId: "mbr_1", label: "Ana" },
    ]);
    expect(paramsFor(tenantMailboxes)).toContain("org_a");
    expect(paramsFor(team)).toContain("org_a");
    expect(paramsFor(member)).toEqual(expect.arrayContaining(["org_a", "active"]));
    expect(paramsFor(mailboxGrant)).toContain("org_a");
  });

  it("owners and admins are not columns; members with extra roles still are", async () => {
    h.rows.set(team, []);
    h.rows.set(member, [
      { publicId: "mbr_owner", name: "Olu", email: "olu@example.test", role: "owner" },
      { publicId: "mbr_admin", name: "Ada", email: "ada@example.test", role: "admin,billing" },
      { publicId: "mbr_member", name: "Max", email: "max@example.test", role: "member,billing" },
    ]);

    const grid = await loadAccessGrid("org_a");

    expect(grid.columns).toEqual([{ kind: "member", memberPublicId: "mbr_member", label: "Max" }]);
  });

  it("only owners and no teams gives zero columns", async () => {
    h.rows.set(team, []);
    h.rows.set(member, [{ publicId: "mbr_owner", name: "Olu", email: "olu@example.test", role: "owner" }]);

    const grid = await loadAccessGrid("org_a");

    expect(grid.columns).toEqual([]);
  });

  it("grid keys grants by mailbox and target", async () => {
    h.rows.set(mailboxGrant, [
      { publicId: "mgr_1", mailboxPublicId: "tmb_1", teamId: "tem_1", memberPublicId: null },
      { publicId: "mgr_2", mailboxPublicId: "tmb_1", teamId: null, memberPublicId: "mbr_9" },
    ]);

    const grid = await loadAccessGrid("org_a");

    expect(grid.grants).toEqual({
      "tmb_1|team:tem_1": "mgr_1",
      "tmb_1|member:mbr_9": "mgr_2",
    });
  });

  it("app grid limits to that app's mailboxes", async () => {
    await loadAccessGrid("org_a", { tenantId: 7n });

    expect(paramsFor(tenantMailboxes)).toContain("7");
    expect(paramsFor(mailboxGrant)).toContain("7");
  });
});
