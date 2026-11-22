"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mailboxGrant, member, team, tenantMailboxes } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";
import { canSeeMailbox } from "@/lib/mailbox/access";
import { mailboxScope } from "@/lib/mailbox/scope";
import { tenantMailboxesService } from "@/lib/services/tenant-mailboxes.service";

export async function updateMailboxSendingAction(formData: FormData): Promise<{ error?: string }> {
  await requirePermission({ mailbox: ["manage"] });
  const publicId = String(formData.get("publicId") ?? "");
  const scope = await mailboxScope();
  const row = await tenantMailboxesService.read(publicId).catch(() => null);
  if (!row || !scope.tenantIds.includes(row.tenantId) || !canSeeMailbox(scope.mailboxIds, row.id)) {
    return { error: "Unknown mailbox" };
  }
  const displayName = String(formData.get("displayName") ?? "").trim();
  const result = await tenantMailboxesService.updateSending(publicId, {
    canSend: formData.get("canSend") === "on",
    displayName: displayName || null,
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/dashboard/settings/mailboxes");
  revalidatePath(`/dashboard/settings/mailboxes/${publicId}`);
  return {};
}

export async function addMailboxGrantAction(
  mailboxPublicId: string,
  target: { teamId: string } | { memberPublicId: string },
): Promise<{ error?: string }> {
  await requirePermission({ mailbox: ["manage"] });
  const scope = await mailboxScope();
  const row = await tenantMailboxesService.read(mailboxPublicId).catch(() => null);
  if (!row || !scope.tenantIds.includes(row.tenantId)) return { error: "Unknown mailbox" };

  // The unique indexes make a repeat grant a no-op.
  if ("teamId" in target) {
    const [found] = await db
      .select({ id: team.id })
      .from(team)
      .where(and(eq(team.organizationId, scope.organizationId), eq(team.id, target.teamId)))
      .limit(1);
    if (!found) return { error: "Unknown team" };
    await db
      .insert(mailboxGrant)
      .values({ organizationId: scope.organizationId, mailboxId: row.id, teamId: found.id })
      .onConflictDoNothing();
  } else {
    const [found] = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.organizationId, scope.organizationId), eq(member.publicId, target.memberPublicId)))
      .limit(1);
    if (!found) return { error: "Unknown member" };
    await db
      .insert(mailboxGrant)
      .values({ organizationId: scope.organizationId, mailboxId: row.id, memberId: found.id })
      .onConflictDoNothing();
  }
  revalidatePath(`/dashboard/settings/mailboxes/${mailboxPublicId}`);
  return {};
}

export async function removeMailboxGrantAction(grantPublicId: string): Promise<{ error?: string }> {
  await requirePermission({ mailbox: ["manage"] });
  const scope = await mailboxScope();
  const [grant] = await db
    .select({ id: mailboxGrant.id, mailboxPublicId: tenantMailboxes.publicId })
    .from(mailboxGrant)
    .innerJoin(tenantMailboxes, eq(tenantMailboxes.id, mailboxGrant.mailboxId))
    .where(and(eq(mailboxGrant.publicId, grantPublicId), eq(mailboxGrant.organizationId, scope.organizationId)))
    .limit(1);
  if (!grant) return { error: "Unknown access" };
  await db.delete(mailboxGrant).where(eq(mailboxGrant.id, grant.id));
  revalidatePath(`/dashboard/settings/mailboxes/${grant.mailboxPublicId}`);
  return {};
}
