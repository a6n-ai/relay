import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  tenantIds: [] as bigint[],
  access: "all" as "all" | bigint[],
  row: null as null | { id: bigint; publicId: string; tenantId: bigint },
  updateSending: vi.fn(),
  selects: [] as unknown[][],
  inserts: [] as { values: Record<string, unknown>; onConflictDoNothing: boolean }[],
  deletes: [] as unknown[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/client", () => {
  const resolved = (value: unknown) => ({ then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(value).then(ok, bad) });
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = { ...resolved(h.selects.shift() ?? []) };
    for (const m of ["from", "innerJoin", "where", "limit"]) c[m] = () => c;
    return c;
  };
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          const entry = { values, onConflictDoNothing: false };
          h.inserts.push(entry);
          return {
            onConflictDoNothing: () => {
              entry.onConflictDoNothing = true;
              return resolved(undefined);
            },
          };
        },
      }),
      delete: (table: unknown) => ({
        where: () => {
          h.deletes.push(table);
          return resolved(undefined);
        },
      }),
    },
  };
});
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

const { addMailboxGrantAction, removeMailboxGrantAction, updateMailboxSendingAction } = await import("./actions");

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
    h.selects = [];
    h.inserts = [];
    h.deletes = [];
  });

  describe("mailbox grants", () => {
    it("grant refuses a team from another workspace", async () => {
      h.selects = [[]];

      await expect(addMailboxGrantAction("tmb_x", { teamId: "tem_other" })).resolves.toEqual({ error: "Unknown team" });
      expect(h.inserts).toEqual([]);
    });

    it("grant refuses a member from another workspace", async () => {
      h.selects = [[]];

      await expect(addMailboxGrantAction("tmb_x", { memberPublicId: "mbr_other" })).resolves.toEqual({
        error: "Unknown member",
      });
      expect(h.inserts).toEqual([]);
    });

    it("granting twice is a no-op", async () => {
      h.selects = [[{ id: "tem_1" }]];

      await expect(addMailboxGrantAction("tmb_x", { teamId: "tem_1" })).resolves.toEqual({});
      expect(h.inserts).toEqual([
        expect.objectContaining({ values: expect.objectContaining({ mailboxId: 5n, teamId: "tem_1" }), onConflictDoNothing: true }),
      ]);
    });

    it("remove refuses a grant from another workspace", async () => {
      h.selects = [[]];

      await expect(removeMailboxGrantAction("mgr_other")).resolves.toEqual({ error: "Unknown access" });
      expect(h.deletes).toEqual([]);
    });
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
