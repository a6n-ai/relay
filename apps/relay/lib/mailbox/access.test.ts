import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  canManage: false,
  member: null as null | { id: string; organizationId: string; userId: bigint; role: string; status: string },
  rows: [] as { mailboxId: bigint }[],
}));

vi.mock("@/lib/auth/guards", () => ({
  can: async () => state.canManage,
  activeMember: async () => state.member,
}));

vi.mock("@/db/client", () => {
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "selectDistinct", "from", "innerJoin", "where"]) chain[k] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(state.rows).then(resolve, reject);
  return { db: chain };
});

const { mailboxAccess, canSeeMailbox } = await import("./access");

const member = { id: "mbr_1", organizationId: "org_1", userId: 5n, role: "member", status: "active" };

describe("mailboxAccess", () => {
  beforeEach(() => {
    state.canManage = false;
    state.member = member;
    state.rows = [];
  });

  it("admins see all mailboxes", async () => {
    state.canManage = true;
    await expect(mailboxAccess()).resolves.toBe("all");
  });

  it("members see direct and team grants", async () => {
    state.rows = [{ mailboxId: 1n }, { mailboxId: 2n }];
    await expect(mailboxAccess()).resolves.toEqual([1n, 2n]);
  });

  it("no member row sees nothing", async () => {
    state.member = null;
    state.rows = [{ mailboxId: 1n }];
    await expect(mailboxAccess()).resolves.toEqual([]);
  });

  it("suspended members see nothing", async () => {
    state.member = { ...member, status: "suspended" };
    state.rows = [{ mailboxId: 1n }];
    await expect(mailboxAccess()).resolves.toEqual([]);
  });
});

describe("canSeeMailbox", () => {
  it("hides letters without a mailbox from members", () => {
    expect(canSeeMailbox([1n], null)).toBe(false);
  });

  it("shows letters without a mailbox to admins", () => {
    expect(canSeeMailbox("all", null)).toBe(true);
  });

  it("checks membership of the letter's mailbox", () => {
    expect(canSeeMailbox([1n], 1n)).toBe(true);
    expect(canSeeMailbox([1n], 2n)).toBe(false);
  });
});
