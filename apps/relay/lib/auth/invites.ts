import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { invitation, organization } from "@/db/schema";

export const INVITE_LIFETIME_S = 7 * 24 * 60 * 60;

export function invitesConfigured(): boolean {
  return Boolean(process.env.BETTER_AUTH_URL);
}

export function inviteUrl(invitationId: string): string {
  return `${process.env.BETTER_AUTH_URL}/accept-invitation/${invitationId}`;
}

export function isInviteOpen(inv: { status: string; expiresAt: Date }, now: Date): boolean {
  return inv.status === "pending" && inv.expiresAt.getTime() > now.getTime();
}

/** The invite's workspace name and invited email, or null when it is unknown, used, cancelled or expired. */
export async function loadOpenInvite(invitationId: string): Promise<{ id: string; email: string; workspaceName: string } | null> {
  const [row] = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      workspaceName: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(eq(invitation.id, invitationId))
    .limit(1);
  if (!row || !isInviteOpen(row, new Date())) return null;
  return { id: row.id, email: row.email, workspaceName: row.workspaceName };
}
