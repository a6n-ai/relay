import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@foundry/commons";

const h = vi.hoisted(() => ({
  actor: null as null | { id: string; organizationId: string; role: string; status: string },
  permitted: true,
  selects: [] as unknown[][],
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  removeTeam: vi.fn(),
  addTeamMember: vi.fn(),
  removeTeamMember: vi.fn(),
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
  auth: {
    api: {
      createTeam: (...a: unknown[]) => h.createTeam(...a),
      updateTeam: (...a: unknown[]) => h.updateTeam(...a),
      removeTeam: (...a: unknown[]) => h.removeTeam(...a),
      addTeamMember: (...a: unknown[]) => h.addTeamMember(...a),
      removeTeamMember: (...a: unknown[]) => h.removeTeamMember(...a),
    },
  },
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
  return { db: { select: () => chain() } };
});

const { addTeamMemberAction, createTeamAction, deleteTeamAction, removeTeamMemberAction, renameTeamAction } = await import(
  "./actions"
);

const ownerActor = { id: "mbr_actor", organizationId: "org_x", role: "owner", status: "active" };
const target = { memberId: "mbr_target", userId: 2n, role: "member", status: "active", email: "t@example.test" };

describe("teams actions", () => {
  beforeEach(() => {
    h.actor = ownerActor;
    h.permitted = true;
    h.selects = [];
    h.createTeam.mockReset().mockResolvedValue({ id: "team_new" });
    h.updateTeam.mockReset().mockResolvedValue({});
    h.removeTeam.mockReset().mockResolvedValue({});
    h.addTeamMember.mockReset().mockResolvedValue({});
    h.removeTeamMember.mockReset().mockResolvedValue({});
    h.recordAudit.mockReset();
  });

  it("createTeam refuses a duplicate name", async () => {
    h.selects = [[{ id: "team_sales" }]];
    await expect(createTeamAction("Sales")).resolves.toEqual({ error: "A team with that name already exists" });
    expect(h.createTeam).not.toHaveBeenCalled();
  });

  it("createTeam trims the name and creates it through Better Auth in the active workspace", async () => {
    h.selects = [[]];
    await expect(createTeamAction("  Sales  ")).resolves.toEqual({});
    expect(h.createTeam).toHaveBeenCalledWith(
      expect.objectContaining({ body: { name: "Sales", organizationId: "org_x" } }),
    );
  });

  it("createTeam refuses an empty or over-long name", async () => {
    await expect(createTeamAction("   ")).resolves.toEqual({ error: "Enter a team name (up to 60 characters)" });
    await expect(createTeamAction("x".repeat(61))).resolves.toEqual({ error: "Enter a team name (up to 60 characters)" });
    expect(h.createTeam).not.toHaveBeenCalled();
  });

  it("renameTeamAction refuses a team from another workspace", async () => {
    h.selects = [[]];
    await expect(renameTeamAction("team_other", "Ops")).resolves.toEqual({ error: "Unknown team" });
    expect(h.updateTeam).not.toHaveBeenCalled();
  });

  it("deleteTeam refuses a team from another workspace", async () => {
    h.selects = [[]];
    await expect(deleteTeamAction("team_other")).resolves.toEqual({ error: "Unknown team" });
    expect(h.removeTeam).not.toHaveBeenCalled();
  });

  it("deleteTeamAction removes the team through Better Auth", async () => {
    h.selects = [[{ id: "team_sales" }]];
    await expect(deleteTeamAction("team_sales")).resolves.toEqual({});
    expect(h.removeTeam).toHaveBeenCalledWith(
      expect.objectContaining({ body: { teamId: "team_sales", organizationId: "org_x" } }),
    );
  });

  it("addTeamMember refuses a member from another workspace", async () => {
    h.selects = [[{ id: "team_sales" }], []];
    await expect(addTeamMemberAction("team_sales", "mbr_other")).resolves.toEqual({ error: "Unknown member" });
    expect(h.addTeamMember).not.toHaveBeenCalled();
  });

  it("addTeamMemberAction adds the member's user id to the team", async () => {
    h.selects = [[{ id: "team_sales" }], [target]];
    await expect(addTeamMemberAction("team_sales", "mbr_target")).resolves.toEqual({});
    expect(h.addTeamMember).toHaveBeenCalledWith(
      expect.objectContaining({ body: { teamId: "team_sales", userId: "2", organizationId: "org_x" } }),
    );
  });

  it("removeTeamMemberAction refuses a team from another workspace before touching members", async () => {
    h.selects = [[]];
    await expect(removeTeamMemberAction("team_other", "mbr_target")).resolves.toEqual({ error: "Unknown team" });
    expect(h.removeTeamMember).not.toHaveBeenCalled();
  });

  it("removeTeamMemberAction removes the member's user id from the team", async () => {
    h.selects = [[{ id: "team_sales" }], [target]];
    await expect(removeTeamMemberAction("team_sales", "mbr_target")).resolves.toEqual({});
    expect(h.removeTeamMember).toHaveBeenCalledWith(
      expect.objectContaining({ body: { teamId: "team_sales", userId: "2", organizationId: "org_x" } }),
    );
  });

  it("returns a plain refusal when the permission check fails", async () => {
    h.permitted = false;
    await expect(deleteTeamAction("team_sales")).resolves.toEqual({ error: "You don’t have access to do that" });
    expect(h.removeTeam).not.toHaveBeenCalled();
  });
});
