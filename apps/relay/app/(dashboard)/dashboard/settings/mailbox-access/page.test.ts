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
});
