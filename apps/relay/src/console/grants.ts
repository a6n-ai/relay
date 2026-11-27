import { and, eq } from "drizzle-orm";
import { createAddressGrant } from "../core/addresses";
import { coreDb } from "../db/core/client";
import { address } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { addressGrant, member, team, user } from "../db/security/schema";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { allows } from "../lib/auth/permissions";
import { type ConsoleActor, ConsoleError, parseRoles, uniqueViolation } from "./actor";

export type GrantView = { id: string; kind: "member" | "team"; targetId: string; label: string };

const requireManage = (actor: ConsoleActor): void => {
  if (!allows(actor.roles, { mailbox: ["manage"] })) throw new ConsoleError(403, "forbidden");
};

export async function getAddressAccess(env: Env, actor: ConsoleActor, addressId: string) {
  requireManage(actor);
  const [owned] = await coreDb(env)
    .select({ id: address.id, email: address.email })
    .from(address)
    .where(and(eq(address.id, addressId), eq(address.workspaceId, actor.workspaceId)));
  if (!owned) throw new ConsoleError(404, "not found");

  const db = securityDb(env);
  const [grantRows, memberRows, teamRows] = await Promise.all([
    db
      .select({
        id: addressGrant.id,
        memberId: addressGrant.memberId,
        teamId: addressGrant.teamId,
        memberName: user.name,
        memberEmail: user.email,
        teamName: team.name,
      })
      .from(addressGrant)
      .leftJoin(member, eq(member.id, addressGrant.memberId))
      .leftJoin(user, eq(user.id, member.userId))
      .leftJoin(team, eq(team.id, addressGrant.teamId))
      .where(and(eq(addressGrant.addressId, addressId), eq(addressGrant.workspaceId, actor.workspaceId))),
    db
      .select({ id: member.id, name: user.name, email: user.email, role: member.role })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, actor.workspaceId)),
    db.select({ id: team.id, name: team.name }).from(team).where(eq(team.organizationId, actor.workspaceId)),
  ]);

  const grants: GrantView[] = grantRows.flatMap((g): GrantView[] => {
    if (g.memberId) return [{ id: g.id, kind: "member", targetId: g.memberId, label: g.memberName || g.memberEmail || "" }];
    if (g.teamId) return [{ id: g.id, kind: "team", targetId: g.teamId, label: g.teamName ?? "" }];
    return [];
  });
  return {
    address: owned,
    grants,
    // Owners and admins already read every address, so a grant would change nothing for them.
    members: memberRows
      .filter((m) => !parseRoles(m.role).some((r) => r === "owner" || r === "admin"))
      .map((m) => ({ id: m.id, label: m.name || m.email })),
    teams: teamRows.map((t) => ({ id: t.id, label: t.name })),
  };
}

// Mapped from the core messages, and from the grant indexes on a race; anything else is a real failure.
function grantFailure(err: unknown): unknown {
  if (
    uniqueViolation(err, "address_grant.address_id, address_grant.member_id") ||
    uniqueViolation(err, "address_grant.address_id, address_grant.team_id")
  ) {
    return new ConsoleError(409, "already has access");
  }
  if (err instanceof Error) {
    if (err.message === "exactly one grantee required") return new ConsoleError(400, "invalid input");
    if (err.message === "address does not belong to workspace" || err.message === "grantee does not belong to workspace") {
      return new ConsoleError(404, "not found");
    }
  }
  return err;
}

export async function addGrant(
  env: Env,
  actor: ConsoleActor,
  input: { addressId: string; memberId?: string; teamId?: string },
): Promise<void> {
  requireManage(actor);
  let grantId: string;
  try {
    grantId = await createAddressGrant(env, { ...input, workspaceId: actor.workspaceId });
  } catch (err) {
    throw grantFailure(err);
  }
  await writeAudit(env, {
    action: "address_grant.add",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: input.addressId,
    data: input.memberId ? { grantId, memberId: input.memberId } : { grantId, teamId: input.teamId },
  });
}

export async function removeGrant(env: Env, actor: ConsoleActor, grantId: string): Promise<void> {
  requireManage(actor);
  const rows = await securityDb(env)
    .delete(addressGrant)
    .where(and(eq(addressGrant.id, grantId), eq(addressGrant.workspaceId, actor.workspaceId)))
    .returning({ addressId: addressGrant.addressId, memberId: addressGrant.memberId, teamId: addressGrant.teamId });
  if (rows.length === 0) throw new ConsoleError(404, "not found");
  const [row] = rows;
  await writeAudit(env, {
    action: "address_grant.remove",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: row.addressId,
    data: row.memberId ? { grantId, memberId: row.memberId } : { grantId, teamId: row.teamId },
  });
}
