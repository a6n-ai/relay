"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, gte, sql } from "drizzle-orm";
import { ForbiddenError } from "@foundry/commons";
import { db } from "@/db/client";
import { invitation, member, organization, session, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { activeMember, requirePermission } from "@/lib/auth/guards";
import { inviteUrl, invitesConfigured } from "@/lib/auth/invites";
import { checkInviteRoles, checkRoleChange, checkSuspendOrRemove, parseRoles } from "@/lib/auth/member-rules";
import type { orgRoles } from "@/lib/auth/permissions";
import { sendInviteEmail } from "@/lib/auth/security-events";
import { getSession } from "@/lib/auth/session";
import { inviteCapReached } from "@/lib/auth/workspace-limits";
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INVITE_CAP_ERROR = "This workspace has sent 20 invites today. Try again tomorrow.";

async function invitesLast24h(organizationId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(invitation)
    .where(and(eq(invitation.organizationId, organizationId), gte(invitation.createdAt, since)));
  return Number(row?.n ?? 0);
}

// Callers validate `roles` with checkInviteRoles, which guarantees every entry is an orgRoles key.
// resend keeps the pending invite's roles; a fresh invite (re-invite) replaces it with the new roles.
async function sendInvite(organizationId: string, email: string, roles: string[], resend: boolean): Promise<Result> {
  let invite;
  try {
    invite = await auth.api.createInvitation({
      headers: await headers(),
      body: {
        email,
        role: roles as (keyof typeof orgRoles)[],
        organizationId,
        ...(resend ? { resend: true } : {}),
      },
    });
  } catch {
    return { error: "Could not send the invite" };
  }
  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  const me = await getSession();
  try {
    await sendInviteEmail({
      email,
      workspaceName: org?.name ?? "this workspace",
      inviterName: me?.user.name || me?.user.email || "A teammate",
      url: inviteUrl(invite.id),
    });
  } catch {
    return { error: "Invite saved, but the email could not be sent. Resend it from this list." };
  }
  revalidatePath("/dashboard/accounts");
  return {};
}

export async function inviteTeammateAction(input: { email: string; roles: string[] }): Promise<Result> {
  const denied = await guard({ invitation: ["create"] });
  if (denied) return { error: denied };
  const actor = await activeMember();
  if (!actor) return { error: DENIED };
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email" };
  const roles = Array.isArray(input.roles) && input.roles.every((r) => typeof r === "string") ? input.roles : [];
  const roleError = checkInviteRoles(parseRoles(actor.role), roles);
  if (roleError) return { error: roleError };

  const [existing] = await db
    .select({ memberId: member.id })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(and(eq(member.organizationId, actor.organizationId), eq(users.email, email)))
    .limit(1);
  if (existing) return { error: "Already on this workspace" };
  if (!invitesConfigured()) return { error: "Invites are not set up" };
  if (inviteCapReached(await invitesLast24h(actor.organizationId))) return { error: INVITE_CAP_ERROR };

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    try {
      // Session-less server call: no headers, so no admin-plugin permission check. The guard above authorizes.
      const created = await auth.api.createUser({
        body: { email, name: email.split("@")[0], role: "user" },
      });
      await db.update(users).set({ passwordSet: false }).where(eq(users.id, BigInt(created.user.id)));
    } catch {
      return { error: "Could not send the invite" };
    }
  }
  return sendInvite(actor.organizationId, email, roles, false);
}

export async function resendInvitationAction(invitationId: string): Promise<Result> {
  const denied = await guard({ invitation: ["create"] });
  if (denied) return { error: denied };
  const actor = await activeMember();
  if (!actor) return { error: DENIED };
  const [pending] = await db
    .select({ email: invitation.email, role: invitation.role })
    .from(invitation)
    .where(
      and(
        eq(invitation.id, invitationId),
        eq(invitation.organizationId, actor.organizationId),
        eq(invitation.status, "pending"),
      ),
    )
    .limit(1);
  if (!pending) return { error: "This invite has expired or was already used" };
  const roles = parseRoles(pending.role);
  const roleError = checkInviteRoles(parseRoles(actor.role), roles);
  if (roleError) return { error: roleError };
  if (!invitesConfigured()) return { error: "Invites are not set up" };
  if (inviteCapReached(await invitesLast24h(actor.organizationId))) return { error: INVITE_CAP_ERROR };
  return sendInvite(actor.organizationId, pending.email, roles, true);
}

export async function cancelInvitationAction(invitationId: string): Promise<Result> {
  const denied = await guard({ invitation: ["cancel"] });
  if (denied) return { error: denied };
  const actor = await activeMember();
  if (!actor) return { error: DENIED };
  const [pending] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.id, invitationId),
        eq(invitation.organizationId, actor.organizationId),
        eq(invitation.status, "pending"),
      ),
    )
    .limit(1);
  if (!pending) return { error: "Unknown invite" };
  try {
    await auth.api.cancelInvitation({ headers: await headers(), body: { invitationId } });
  } catch {
    return { error: "Could not cancel the invite" };
  }
  revalidatePath("/dashboard/accounts");
  return {};
}
