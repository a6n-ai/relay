import { cache } from "react";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { mailboxGrant, team, teamMember } from "@/db/schema";
import { activeMember, can } from "@/lib/auth/guards";

export type MailboxAccess = "all" | bigint[];

export const mailboxAccess = cache(async (): Promise<MailboxAccess> => {
  if (await can({ mailbox: ["manage"] })) return "all";
  const m = await activeMember();
  if (!m || m.status !== "active") return [];
  const userTeams = db
    .select({ id: team.id })
    .from(team)
    .innerJoin(teamMember, eq(teamMember.teamId, team.id))
    .where(and(eq(teamMember.userId, m.userId), eq(team.organizationId, m.organizationId)));
  const rows = await db
    .selectDistinct({ mailboxId: mailboxGrant.mailboxId })
    .from(mailboxGrant)
    .where(
      and(
        eq(mailboxGrant.organizationId, m.organizationId),
        or(eq(mailboxGrant.memberId, m.id), inArray(mailboxGrant.teamId, userTeams)),
      ),
    );
  return rows.map((r) => r.mailboxId);
});

export function canSeeMailbox(access: MailboxAccess, mailboxId: bigint | null): boolean {
  if (access === "all") return true;
  if (mailboxId === null) return false;
  return access.includes(mailboxId);
}
