import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  loadAccessGrid: vi.fn(),
  guard: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requirePagePermission: (...args: unknown[]) => h.guard(...args) }));
vi.mock("@/lib/auth/active-org", () => ({ requireActiveOrganizationId: async () => "org_a" }));
vi.mock("@/lib/mailbox/access-grid", () => ({ loadAccessGrid: (...args: unknown[]) => h.loadAccessGrid(...args) }));
vi.mock("@/app/(dashboard)/dashboard/settings/mailboxes/[id]/actions", () => ({
  addMailboxGrantAction: vi.fn(),
  removeMailboxGrantAction: vi.fn(),
}));

const { default: MailboxAccessPage } = await import("./page");

describe("mailbox access page", () => {
  beforeEach(() => {
    h.loadAccessGrid.mockReset();
    h.guard.mockReset();
  });

  it("404s without mailbox:manage before loading", async () => {
    h.guard.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(MailboxAccessPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(h.guard).toHaveBeenCalledWith({ mailbox: ["manage"] });
    expect(h.loadAccessGrid).not.toHaveBeenCalled();
  });

  it("owners-only workspace with no teams shows the Members empty state, not the grid", async () => {
    h.guard.mockResolvedValue(undefined);
    h.loadAccessGrid.mockResolvedValue({
      mailboxes: [{ id: 1n, publicId: "tmb_1", email: "help@alpha.test", appName: "Alpha" }],
      columns: [],
      grants: {},
    });

    const seen = new WeakSet<object>();
    const tree = JSON.stringify(await MailboxAccessPage(), (k, v) => {
      if (k.startsWith("_") || (typeof v === "object" && v !== null && seen.has(v))) return undefined;
      if (typeof v === "object" && v !== null) seen.add(v);
      return v;
    });

    expect(tree).toContain("/dashboard/settings/members");
    expect(tree).not.toContain('"grid":');
  });
});
