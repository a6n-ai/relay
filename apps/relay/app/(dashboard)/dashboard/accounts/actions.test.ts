import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { ForbiddenError } from "@foundry/commons";
import { member, session, teamMember } from "@/db/schema";

const h = vi.hoisted(() => ({
  actor: null as null | { id: string; organizationId: string; role: string; status: string },
  permitted: true,
  selects: [] as unknown[][],
  updates: [] as { table: unknown; values: Record<string, unknown>; cond: unknown }[],
  deletes: [] as unknown[],
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  recordAudit: vi.fn(),
  createInvitation: vi.fn(),
  cancelInvitation: vi.fn(),
  createUser: vi.fn(),
  sendInviteEmail: vi.fn(),
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
      updateMemberRole: (...a: unknown[]) => h.updateMemberRole(...a),
      removeMember: (...a: unknown[]) => h.removeMember(...a),
      createInvitation: (...a: unknown[]) => h.createInvitation(...a),
      cancelInvitation: (...a: unknown[]) => h.cancelInvitation(...a),
      createUser: (...a: unknown[]) => h.createUser(...a),
    },
  },
}));
vi.mock("@/lib/auth/security-events", () => ({
  sendInviteEmail: (...a: unknown[]) => h.sendInviteEmail(...a),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ user: { id: "usr_actor", email: "owner@example.test", name: "Olive Owner" }, session: { activeOrganizationId: "org_x" } }),
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
      delete: (table: unknown) => ({
        where: () => {
          h.deletes.push(table);
          return resolved(undefined);
        },
      }),
    },
  };
});

const {
  cancelInvitationAction,
  inviteTeammateAction,
  removeMemberAction,
  resendInvitationAction,
  setMemberRolesAction,
  setMemberStatusAction,
} = await import("./actions");

const ownerActor = { id: "mbr_actor", organizationId: "org_x", role: "owner", status: "active" };
const target = { memberId: "mbr_target", userId: 2n, role: "member", status: "active", email: "t@example.test" };

describe("accounts actions", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_URL = "https://relay.test";
    h.actor = ownerActor;
    h.permitted = true;
    h.selects = [];
    h.updates = [];
    h.deletes = [];
    h.updateMemberRole.mockReset().mockResolvedValue({});
    h.removeMember.mockReset().mockResolvedValue({});
    h.recordAudit.mockReset();
    h.createInvitation.mockReset().mockResolvedValue({ id: "inv_1" });
    h.cancelInvitation.mockReset().mockResolvedValue({});
    h.createUser.mockReset().mockResolvedValue({ user: { id: "7" } });
    h.sendInviteEmail.mockReset().mockResolvedValue(undefined);
  });

  it("removing a member clears their team memberships in this workspace", async () => {
    h.selects = [[target], [{ role: "owner" }, { role: "owner" }]];

    await expect(removeMemberAction("mbr_target")).resolves.toEqual({});
    expect(h.removeMember).toHaveBeenCalledWith(expect.objectContaining({ body: { memberIdOrEmail: "mbr_target", organizationId: "org_x" } }));
    expect(h.deletes).toContain(teamMember);
  });

  it("invite refuses an existing member", async () => {
    h.selects = [[target]];
    await expect(inviteTeammateAction({ email: "t@example.test", roles: ["member"] })).resolves.toEqual({
      error: "Already on this workspace",
    });
    expect(h.createInvitation).not.toHaveBeenCalled();
  });

  it("invite lowercases the email and sends the link with the invitation id", async () => {
    h.selects = [[], [{ n: 0 }], [{ id: 2n }], [{ name: "Acme" }]];
    await expect(inviteTeammateAction({ email: "  Ana@Example.TEST ", roles: ["member"] })).resolves.toEqual({});
    expect(h.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { email: "ana@example.test", role: ["member"], organizationId: "org_x" },
      }),
    );
    expect(h.sendInviteEmail).toHaveBeenCalledWith({
      email: "ana@example.test",
      workspaceName: "Acme",
      inviterName: "Olive Owner",
      url: expect.stringMatching(/\/accept-invitation\/inv_1$/),
    });
  });

  it("invite creates a passwordless user for an unknown email", async () => {
    h.selects = [[], [{ n: 0 }], [], [{ name: "Acme" }]];
    await expect(inviteTeammateAction({ email: "new@example.test", roles: ["member"] })).resolves.toEqual({});
    expect(h.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ body: { email: "new@example.test", name: "new", role: "user" } }),
    );
    expect(h.createUser.mock.calls[0][0]).not.toHaveProperty("headers");
    expect(h.updates).toContainEqual(expect.objectContaining({ values: { passwordSet: false } }));
  });

  it("re-invite uses the new roles", async () => {
    h.selects = [[], [{ n: 0 }], [{ id: 2n }], [{ name: "Acme" }]];
    await expect(inviteTeammateAction({ email: "ana@example.test", roles: ["admin"] })).resolves.toEqual({});
    const body = h.createInvitation.mock.calls[0][0].body;
    expect(body.role).toEqual(["admin"]);
    expect(body.resend).toBeUndefined();
  });

  it("invite and resend refuse when BETTER_AUTH_URL is unset", async () => {
    const saved = process.env.BETTER_AUTH_URL;
    delete process.env.BETTER_AUTH_URL;
    try {
      h.selects = [[], [{ id: 2n }]];
      await expect(inviteTeammateAction({ email: "ana@example.test", roles: ["member"] })).resolves.toEqual({
        error: "Invites are not set up",
      });
      h.selects = [[{ id: "inv_1", email: "ana@example.test", role: "member" }]];
      await expect(resendInvitationAction("inv_1")).resolves.toEqual({ error: "Invites are not set up" });
      expect(h.createInvitation).not.toHaveBeenCalled();
      expect(h.createUser).not.toHaveBeenCalled();
    } finally {
      if (saved === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = saved;
    }
  });

  it("admin cannot invite an owner", async () => {
    h.actor = { ...ownerActor, role: "admin" };
    await expect(inviteTeammateAction({ email: "t@example.test", roles: ["owner"] })).resolves.toEqual({
      error: "Only an owner can add or remove the owner role",
    });
    expect(h.createInvitation).not.toHaveBeenCalled();
  });

  it("resend re-sends the same invitation with its email and role", async () => {
    h.selects = [[{ id: "inv_1", email: "ana@example.test", role: "member" }], [{ n: 0 }], [{ name: "Acme" }]];
    await expect(resendInvitationAction("inv_1")).resolves.toEqual({});
    expect(h.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ body: { email: "ana@example.test", role: ["member"], organizationId: "org_x", resend: true } }),
    );
    expect(h.sendInviteEmail).toHaveBeenCalledWith(expect.objectContaining({ email: "ana@example.test" }));
  });

  it("resend counts toward the cap", async () => {
    h.selects = [[{ id: "inv_1", email: "ana@example.test", role: "member" }], [{ n: 20 }]];
    await expect(resendInvitationAction("inv_1")).resolves.toEqual({
      error: "This workspace has sent 20 invites today. Try again tomorrow.",
    });
    expect(h.createInvitation).not.toHaveBeenCalled();
    expect(h.sendInviteEmail).not.toHaveBeenCalled();
  });

  it("refuses the 21st invite", async () => {
    h.selects = [[], [{ n: 20 }]];
    await expect(inviteTeammateAction({ email: "ana@example.test", roles: ["member"] })).resolves.toEqual({
      error: "This workspace has sent 20 invites today. Try again tomorrow.",
    });
    expect(h.createUser).not.toHaveBeenCalled();
    expect(h.createInvitation).not.toHaveBeenCalled();
  });

  it("allows the 20th invite", async () => {
    h.selects = [[], [{ n: 19 }], [{ id: 2n }], [{ name: "Acme" }]];
    await expect(inviteTeammateAction({ email: "ana@example.test", roles: ["member"] })).resolves.toEqual({});
    expect(h.createInvitation).toHaveBeenCalledOnce();
  });

  it("cancelInvitationAction cancels through Better Auth", async () => {
    h.selects = [[{ id: "inv_1" }]];
    await expect(cancelInvitationAction("inv_1")).resolves.toEqual({});
    expect(h.cancelInvitation).toHaveBeenCalledWith(expect.objectContaining({ body: { invitationId: "inv_1" } }));
  });

  it("cancel refuses an invite from another workspace", async () => {
    h.selects = [[]];
    await expect(cancelInvitationAction("inv_other")).resolves.toEqual({ error: "Unknown invite" });
    expect(h.cancelInvitation).not.toHaveBeenCalled();
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
