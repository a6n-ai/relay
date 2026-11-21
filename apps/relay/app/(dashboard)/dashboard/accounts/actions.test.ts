import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { ForbiddenError } from "@foundry/commons";
import { member, session } from "@/db/schema";

const h = vi.hoisted(() => ({
  actor: null as null | { id: string; organizationId: string; role: string; status: string },
  permitted: true,
  selects: [] as unknown[][],
  updates: [] as { table: unknown; values: Record<string, unknown>; cond: unknown }[],
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({
  requirePermission: async () => {
    if (!h.permitted) throw new ForbiddenError();
  },
  activeMember: async () => h.actor,
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { updateMemberRole: (...a: unknown[]) => h.updateMemberRole(...a), removeMember: (...a: unknown[]) => h.removeMember(...a) } },
}));
vi.mock("@/lib/services/session-service", () => ({
  recordAudit: (...a: unknown[]) => h.recordAudit(...a),
  currentUserId: async () => 9n,
}));
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
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: (cond: unknown) => {
            h.updates.push({ table, values, cond });
            return resolved(undefined);
          },
        }),
      }),
    },
  };
});

const { removeMemberAction, setMemberRolesAction, setMemberStatusAction } = await import("./actions");

const ownerActor = { id: "mbr_actor", organizationId: "org_x", role: "owner", status: "active" };
const target = { memberId: "mbr_target", userId: 2n, role: "member", status: "active", email: "t@example.test" };

describe("accounts actions", () => {
  beforeEach(() => {
    h.actor = ownerActor;
    h.permitted = true;
    h.selects = [];
    h.updates = [];
    h.updateMemberRole.mockReset().mockResolvedValue({});
    h.removeMember.mockReset().mockResolvedValue({});
    h.recordAudit.mockReset();
  });

  it("setMemberRolesAction refuses a member of another workspace", async () => {
    h.selects = [[]];
    await expect(setMemberRolesAction("mbr_other", ["member"])).resolves.toEqual({ error: "Unknown member" });
    expect(h.updateMemberRole).not.toHaveBeenCalled();
  });

  it("setMemberRolesAction sends the role array to Better Auth and audits", async () => {
    h.selects = [[target], [{ role: "owner" }]];
    await expect(setMemberRolesAction("mbr_target", ["member", "billing"])).resolves.toEqual({});
    expect(h.updateMemberRole).toHaveBeenCalledWith(
      expect.objectContaining({ body: { memberId: "mbr_target", role: ["member", "billing"], organizationId: "org_x" } }),
    );
    expect(h.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entity: "member", entityPublicId: "mbr_target" }));
  });

  it("setMemberStatusAction suspends and clears that workspace session", async () => {
    h.selects = [[target], [{ role: "owner" }, { role: "member" }]];
    await expect(setMemberStatusAction("mbr_target", "suspended")).resolves.toEqual({});

    const memberUpdate = h.updates.find((u) => u.table === member);
    expect(memberUpdate?.values).toEqual({ status: "suspended" });

    const sessionUpdate = h.updates.find((u) => u.table === session);
    expect(sessionUpdate?.values).toEqual({ activeOrganizationId: null });
    const { params } = new PgDialect().sqlToQuery(sessionUpdate!.cond as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(params).toContain("org_x");
  });

  it("setMemberRolesAction rejects a non-array roles value", async () => {
    h.selects = [[target], [{ role: "owner" }]];
    await expect(setMemberRolesAction("mbr_target", "member" as unknown as string[])).resolves.toEqual({ error: "Pick at least one role" });
    expect(h.updateMemberRole).not.toHaveBeenCalled();
  });

  it("setMemberStatusAction refuses an admin reactivating an owner", async () => {
    h.actor = { ...ownerActor, role: "admin" };
    h.selects = [[{ ...target, role: "owner", status: "suspended" }], [{ role: "owner" }]];
    await expect(setMemberStatusAction("mbr_target", "active")).resolves.toEqual({
      error: "Only an owner can suspend or remove an owner",
    });
    expect(h.updates).toEqual([]);
  });

  it("setMemberStatusAction refuses suspending the last owner", async () => {
    h.selects = [[{ ...target, role: "owner" }], [{ role: "owner" }]];
    await expect(setMemberStatusAction("mbr_target", "suspended")).resolves.toEqual({
      error: "A workspace needs at least one owner",
    });
    expect(h.updates).toEqual([]);
  });

  it("removeMemberAction refuses the last owner", async () => {
    h.selects = [[{ ...target, role: "owner" }], [{ role: "owner" }]];
    await expect(removeMemberAction("mbr_target")).resolves.toEqual({ error: "A workspace needs at least one owner" });
    expect(h.removeMember).not.toHaveBeenCalled();
  });

  it("maps the database owner guard to the owner error", async () => {
    h.selects = [[target], [{ role: "owner" }, { role: "owner" }]];
    h.updateMemberRole.mockRejectedValue(new Error("x", { cause: new Error("A workspace needs at least one owner") }));
    await expect(setMemberRolesAction("mbr_target", ["member", "billing"])).resolves.toEqual({
      error: "A workspace needs at least one owner",
    });
  });

  it("returns a plain refusal when the permission check fails", async () => {
    h.permitted = false;
    await expect(removeMemberAction("mbr_target")).resolves.toEqual({ error: "You don’t have access to do that" });
    expect(h.removeMember).not.toHaveBeenCalled();
  });
});
