import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tenantIds: [] as bigint[],
  access: "all" as "all" | bigint[],
  row: null as null | { id: bigint; publicId: string; tenantId: bigint },
  updateSending: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/mailbox/access", () => ({
  canSeeMailbox: (access: "all" | bigint[], mailboxId: bigint | null) =>
    access === "all" || (mailboxId !== null && access.includes(mailboxId)),
}));
vi.mock("@/lib/mailbox/scope", () => ({
  mailboxScope: async () => ({ organizationId: "org_x", tenantIds: h.tenantIds, includeOperatorMail: false, mailboxIds: h.access }),
}));
vi.mock("@/lib/services/tenant-mailboxes.service", () => ({
  tenantMailboxesService: {
    read: async () => {
      if (!h.row) throw new Error("not found");
      return h.row;
    },
    updateSending: (...args: unknown[]) => h.updateSending(...args),
  },
}));

const { updateMailboxSendingAction } = await import("./actions");

function form(over: Record<string, string> = {}) {
  const fd = new FormData();
  const base = { publicId: "tmb_x", displayName: "  Help ", canSend: "on", ...over };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
}

describe("updateMailboxSendingAction", () => {
  beforeEach(() => {
    h.tenantIds = [1n];
    h.access = "all";
    h.row = { id: 5n, publicId: "tmb_x", tenantId: 1n };
    h.updateSending.mockReset();
    h.updateSending.mockResolvedValue({ publicId: "tmb_x" });
  });

  it("rejects a mailbox outside the workspace", async () => {
    h.row = { id: 5n, publicId: "tmb_x", tenantId: 2n };

    await expect(updateMailboxSendingAction(form())).resolves.toEqual({ error: "Unknown mailbox" });
    expect(h.updateSending).not.toHaveBeenCalled();
  });

  it("member cannot change a mailbox they were not granted", async () => {
    h.access = [6n];

    await expect(updateMailboxSendingAction(form())).resolves.toEqual({ error: "Unknown mailbox" });
    expect(h.updateSending).not.toHaveBeenCalled();
  });

  it("passes canSend and trimmed displayName", async () => {
    await expect(updateMailboxSendingAction(form())).resolves.toEqual({});

    expect(h.updateSending).toHaveBeenCalledWith("tmb_x", { canSend: true, displayName: "Help" });
  });

  it("empty displayName becomes null", async () => {
    await updateMailboxSendingAction(form({ displayName: "   ", canSend: "" }));

    expect(h.updateSending).toHaveBeenCalledWith("tmb_x", { canSend: false, displayName: null });
  });
});
