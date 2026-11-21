"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { ForbiddenError } from "@foundry/commons";
import { db } from "@/db/client";
import { member, session, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { activeMember, requirePermission } from "@/lib/auth/guards";
import { checkRoleChange, checkSuspendOrRemove, parseRoles } from "@/lib/auth/member-rules";
import { currentUserId, recordAudit } from "@/lib/services/session-service";

const DENIED = "You don’t have access to do that";

type Result = { error?: string };

const OWNER_GUARD = "A workspace needs at least one owner";

// The database trigger raises this; Better Auth and Drizzle wrap it, so walk the cause chain.
function ownerGuardError(err: unknown): Result | null {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if (e.message.includes(OWNER_GUARD)) return { error: OWNER_GUARD };
  }
  return null;
}

async function guard(perms: Record<string, string[]>): Promise<string | null> {
  try {
    await requirePermission(perms);
    return null;
  } catch (err) {
    if (err instanceof ForbiddenError) return DENIED;
    throw err;
  }
}

async function findTarget(organizationId: string, publicId: string) {
  const [row] = await db
    .select({
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      status: member.status,
      email: users.email,
    })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(and(eq(member.organizationId, organizationId), eq(member.publicId, publicId)))
    .limit(1);
  return row ?? null;
}

async function activeOwnerCount(organizationId: string): Promise<number> {
  const rows = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.status, "active")));
  return rows.filter((r) => parseRoles(r.role).includes("owner")).length;
}

const toActor = (a: { id: string; role: string }) => ({ memberId: a.id, roles: parseRoles(a.role) });
const toTarget = (t: { memberId: string; role: string; status: string }) => ({
  memberId: t.memberId,
  roles: parseRoles(t.role),
  status: t.status,
});

export async function setMemberRolesAction(memberPublicId: string, roles: string[]): Promise<Result> {
  const denied = await guard({ member: ["update"] });
  if (denied) return { error: denied };
  if (!Array.isArray(roles) || roles.length < 1 || roles.length > 10 || !roles.every((r) => typeof r === "string")) {
    return { error: "Pick at least one role" };
  }
  const actor = await activeMember();
  if (!actor) return { error: DENIED };
  const target = await findTarget(actor.organizationId, memberPublicId);
  if (!target) return { error: "Unknown member" };

  const error = checkRoleChange({
    actor: toActor(actor),
    target: toTarget(target),
    next: roles,
    activeOwnerCount: await activeOwnerCount(actor.organizationId),
  });
  if (error) return { error };

  try {
    await auth.api.updateMemberRole({
      headers: await headers(),
      body: { memberId: target.memberId, role: roles, organizationId: actor.organizationId },
    });
  } catch (err) {
    return ownerGuardError(err) ?? { error: "Could not change roles" };
  }
  await recordAudit({
    entity: "member",
    entityPublicId: memberPublicId,
    operation: "update",
    changes: { role: { from: target.role, to: roles.join(",") } },
    createdBy: await currentUserId(),
  });
  revalidatePath("/dashboard/accounts");
  return {};
}

export async function setMemberStatusAction(memberPublicId: string, status: "active" | "suspended"): Promise<Result> {
  const denied = await guard({ member: ["update"] });
  if (denied) return { error: denied };
  if (status !== "active" && status !== "suspended") return { error: "Unknown status" };
  const actor = await activeMember();
  if (!actor) return { error: DENIED };
  const target = await findTarget(actor.organizationId, memberPublicId);
  if (!target) return { error: "Unknown member" };

  const error = checkSuspendOrRemove({
    actor: toActor(actor),
    target: toTarget(target),
    activeOwnerCount: await activeOwnerCount(actor.organizationId),
    action: status === "suspended" ? "suspend" : "reactivate",
  });
  if (error) return { error };

  try {
    await db.update(member).set({ status }).where(eq(member.id, target.memberId));
  } catch (err) {
    const guarded = ownerGuardError(err);
    if (!guarded) throw err;
    return guarded;
  }
  if (status === "suspended") {
    await db
      .update(session)
      .set({ activeOrganizationId: null })
      .where(and(eq(session.userId, target.userId), eq(session.activeOrganizationId, actor.organizationId)));
  }
  await recordAudit({
    entity: "member",
    entityPublicId: memberPublicId,
    operation: "update",
    changes: { status: { from: target.status, to: status } },
    createdBy: await currentUserId(),
  });
  revalidatePath("/dashboard/accounts");
  return {};
}

export async function removeMemberAction(memberPublicId: string): Promise<Result> {
  const denied = await guard({ member: ["delete"] });
  if (denied) return { error: denied };
  const actor = await activeMember();
  if (!actor) return { error: DENIED };
  const target = await findTarget(actor.organizationId, memberPublicId);
  if (!target) return { error: "Unknown member" };

  const error = checkSuspendOrRemove({
    actor: toActor(actor),
    target: toTarget(target),
    activeOwnerCount: await activeOwnerCount(actor.organizationId),
    action: "remove",
  });
  if (error) return { error };

  try {
    await auth.api.removeMember({
      headers: await headers(),
      body: { memberIdOrEmail: target.memberId, organizationId: actor.organizationId },
    });
  } catch (err) {
    return ownerGuardError(err) ?? { error: "Could not remove member" };
  }
  await recordAudit({
    entity: "member",
    entityPublicId: memberPublicId,
    operation: "delete",
    changes: null,
    createdBy: await currentUserId(),
  });
  revalidatePath("/dashboard/accounts");
  return {};
}
