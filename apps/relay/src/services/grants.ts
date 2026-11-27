import { and, eq } from "drizzle-orm";
import { createAddressGrant } from "../core/addresses";
import { coreDb } from "../db/core/client";
import { address } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { addressGrant, member, team, user } from "../db/security/schema";
import type { Env } from "../env";
import { parseRoles, uniqueViolation } from "../auth/session";
import { audit, type Principal } from "./principal";
import { RelayError, codeOf } from "../shared/errors";

type GrantView = { id: string; kind: "member" | "team"; targetId: string; label: string };

export async function getAddressAccess(env: Env, p: Principal, addressId: string) {
  const [owned] = await coreDb(env)
    .select({ id: address.id, email: address.email })
    .from(address)
    .where(and(eq(address.id, addressId), eq(address.workspaceId, p.workspaceId)));
  if (!owned) throw new RelayError("not found");

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
      .where(and(eq(addressGrant.addressId, addressId), eq(addressGrant.workspaceId, p.workspaceId))),
    db
      .select({ id: member.id, name: user.name, email: user.email, role: member.role })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, p.workspaceId)),
    db.select({ id: team.id, name: team.name }).from(team).where(eq(team.organizationId, p.workspaceId)),
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
    return new RelayError("already has access");
  }
  const code = codeOf(err);
  if (code === "exactly one grantee required") return new RelayError("invalid input");
  if (code === "address does not belong to workspace" || code === "grantee does not belong to workspace") return new RelayError("not found");
  return err;
}

export async function addGrant(
  env: Env,
  p: Principal,
  input: { addressId: string; memberId?: string; teamId?: string },
): Promise<void> {
  let grantId: string;
  try {
    grantId = await createAddressGrant(env, { ...input, workspaceId: p.workspaceId });
  } catch (err) {
    throw grantFailure(err);
  }
  await audit(env, p, "address_grant.add", input.addressId, input.memberId ? { grantId, memberId: input.memberId } : { grantId, teamId: input.teamId });
}

export async function removeGrant(env: Env, p: Principal, grantId: string): Promise<void> {
  const rows = await securityDb(env)
    .delete(addressGrant)
    .where(and(eq(addressGrant.id, grantId), eq(addressGrant.workspaceId, p.workspaceId)))
    .returning({ addressId: addressGrant.addressId, memberId: addressGrant.memberId, teamId: addressGrant.teamId });
  if (rows.length === 0) throw new RelayError("not found");
  const [row] = rows;
  await audit(env, p, "address_grant.remove", row.addressId, row.memberId ? { grantId, memberId: row.memberId } : { grantId, teamId: row.teamId });
}
