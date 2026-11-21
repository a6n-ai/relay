"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { ForbiddenError } from "@foundry/commons";
import { db } from "@/db/client";
import { member, team } from "@/db/schema";
import { auth } from "@/lib/auth";
import { activeMember, requirePermission } from "@/lib/auth/guards";
import { currentUserId, recordAudit } from "@/lib/services/session-service";

const DENIED = "You don’t have access to do that";
const PAGE = "/dashboard/accounts/teams";

type Result = { error?: string };

async function guard(perms: Record<string, string[]>): Promise<string | null> {
  try {
    await requirePermission(perms);
    return null;
  } catch (err) {
    if (err instanceof ForbiddenError) return DENIED;
    throw err;
  }
}

async function findTeam(organizationId: string, teamId: string) {
  const [row] = await db
    .select({ id: team.id, name: team.name })
    .from(team)
    .where(and(eq(team.organizationId, organizationId), eq(team.id, teamId)))
    .limit(1);
  return row ?? null;
}

async function findMember(organizationId: string, memberPublicId: string) {
  const [row] = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.publicId, memberPublicId)))
    .limit(1);
  return row ?? null;
}

async function nameTaken(organizationId: string, name: string, exceptTeamId?: string): Promise<boolean> {
  const [row] = await db
    .select({ id: team.id })
    .from(team)
    .where(
      and(
        eq(team.organizationId, organizationId),
        eq(team.name, name),
        exceptTeamId ? ne(team.id, exceptTeamId) : undefined,
      ),
    )
    .limit(1);
  return row != null;
}

// The team name is shown in lists and headings, so keep it short and single-line.
function cleanName(input: string): string | null {
  const name = String(input ?? "").trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

const NAME_ERROR = "Enter a team name (up to 60 characters)";
const NAME_TAKEN = "A team with that name already exists";

export async function createTeamAction(name: string): Promise<Result> {
  const denied = await guard({ team: ["create"] });
  if (denied) return { error: denied };
  const clean = cleanName(name);
  if (!clean) return { error: NAME_ERROR };
  const actor = await activeMember();
  if (!actor) return { error: DENIED };
  if (await nameTaken(actor.organizationId, clean)) return { error: NAME_TAKEN };

  let created;
  try {
    created = await auth.api.createTeam({
      headers: await headers(),
      body: { name: clean, organizationId: actor.organizationId },
    });
  } catch {
    return { error: "Could not create the team" };
  }
  await recordAudit({
    entity: "team",
    entityPublicId: created.id,
    operation: "create",
    changes: { name: { from: null, to: clean } },
    createdBy: await currentUserId(),
  });
  revalidatePath(PAGE);
  return {};
}

export async function renameTeamAction(teamId: string, name: string): Promise<Result> {
  const denied = await guard({ team: ["update"] });
  if (denied) return { error: denied };
  const clean = cleanName(name);
  if (!clean) return { error: NAME_ERROR };
  const actor = await activeMember();
  if (!actor) return { error: DENIED };
  const target = await findTeam(actor.organizationId, teamId);
  if (!target) return { error: "Unknown team" };
  if (await nameTaken(actor.organizationId, clean, target.id)) return { error: NAME_TAKEN };

  try {
    await auth.api.updateTeam({
      headers: await headers(),
      body: { teamId: target.id, data: { name: clean, organizationId: actor.organizationId } },
    });
  } catch {
    return { error: "Could not rename the team" };
  }
  await recordAudit({
    entity: "team",
    entityPublicId: target.id,
    operation: "update",
    changes: { name: { from: target.name, to: clean } },
    createdBy: await currentUserId(),
  });
  revalidatePath(PAGE);
  return {};
}

export async function deleteTeamAction(teamId: string): Promise<Result> {
  const denied = await guard({ team: ["delete"] });
  if (denied) return { error: denied };
  const actor = await activeMember();
  if (!actor) return { error: DENIED };
  const target = await findTeam(actor.organizationId, teamId);
  if (!target) return { error: "Unknown team" };

  try {
    await auth.api.removeTeam({
      headers: await headers(),
      body: { teamId: target.id, organizationId: actor.organizationId },
    });
  } catch {
    return { error: "Could not delete the team" };
  }
  await recordAudit({
    entity: "team",
    entityPublicId: target.id,
    operation: "delete",
    changes: null,
    createdBy: await currentUserId(),
  });
  revalidatePath(PAGE);
  return {};
}

export async function addTeamMemberAction(teamId: string, memberPublicId: string): Promise<Result> {
  const denied = await guard({ team: ["update"] });
  if (denied) return { error: denied };
  const actor = await activeMember();
  if (!actor) return { error: DENIED };
  const target = await findTeam(actor.organizationId, teamId);
  if (!target) return { error: "Unknown team" };
  const who = await findMember(actor.organizationId, memberPublicId);
  if (!who) return { error: "Unknown member" };

  try {
    await auth.api.addTeamMember({
      headers: await headers(),
      body: { teamId: target.id, userId: String(who.userId), organizationId: actor.organizationId },
    });
  } catch {
    return { error: "Could not add them to the team" };
  }
  await recordAudit({
    entity: "team",
    entityPublicId: target.id,
    operation: "update",
    changes: { member: { from: null, to: memberPublicId } },
    createdBy: await currentUserId(),
  });
  revalidatePath(PAGE);
  return {};
}

export async function removeTeamMemberAction(teamId: string, memberPublicId: string): Promise<Result> {
  const denied = await guard({ team: ["update"] });
  if (denied) return { error: denied };
  const actor = await activeMember();
  if (!actor) return { error: DENIED };
  const target = await findTeam(actor.organizationId, teamId);
  if (!target) return { error: "Unknown team" };
  const who = await findMember(actor.organizationId, memberPublicId);
  if (!who) return { error: "Unknown member" };

  try {
    await auth.api.removeTeamMember({
      headers: await headers(),
      body: { teamId: target.id, userId: String(who.userId), organizationId: actor.organizationId },
    });
  } catch {
    return { error: "Could not remove them from the team" };
  }
  await recordAudit({
    entity: "team",
    entityPublicId: target.id,
    operation: "update",
    changes: { member: { from: memberPublicId, to: null } },
    createdBy: await currentUserId(),
  });
  revalidatePath(PAGE);
  return {};
}
