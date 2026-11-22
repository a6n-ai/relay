import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("@/db/client", () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(h.rows).then(ok, bad),
    };
    for (const m of ["from", "leftJoin", "innerJoin", "where", "orderBy"]) c[m] = () => c;
    return c;
  };
  return { db: { select: () => chain() } };
});

const { listMailboxGrants } = await import("./grants");

describe("listMailboxGrants", () => {
  beforeEach(() => {
    h.rows = [];
  });

  it("labels team grants by team name and member grants by person", async () => {
    h.rows = [
      { publicId: "mgr_1", teamId: "tem_1", teamName: "Support", memberName: null, memberEmail: null },
      { publicId: "mgr_2", teamId: null, teamName: null, memberName: "Ana", memberEmail: "ana@example.test" },
      { publicId: "mgr_3", teamId: null, teamName: null, memberName: null, memberEmail: "bo@example.test" },
    ];

    await expect(listMailboxGrants(5n)).resolves.toEqual([
      { publicId: "mgr_1", kind: "team", label: "Support" },
      { publicId: "mgr_2", kind: "member", label: "Ana" },
      { publicId: "mgr_3", kind: "member", label: "bo@example.test" },
    ]);
  });
});
