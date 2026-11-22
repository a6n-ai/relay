import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mailboxGrant, member, team, users } from "@/db/schema";

export type MailboxGrantRow = { publicId: string; kind: "team" | "member"; label: string };

export async function listMailboxGrants(mailboxId: bigint): Promise<MailboxGrantRow[]> {
  const rows = await db
    .select({
      publicId: mailboxGrant.publicId,
      teamId: mailboxGrant.teamId,
      teamName: team.name,
      memberName: users.name,
      memberEmail: users.email,
    })
    .from(mailboxGrant)
    .leftJoin(team, eq(team.id, mailboxGrant.teamId))
    .leftJoin(member, eq(member.id, mailboxGrant.memberId))
    .leftJoin(users, eq(users.id, member.userId))
    .where(eq(mailboxGrant.mailboxId, mailboxId))
    .orderBy(asc(mailboxGrant.id));
  return rows.map((r) =>
    r.teamId
      ? { publicId: r.publicId, kind: "team", label: r.teamName ?? "" }
      : { publicId: r.publicId, kind: "member", label: r.memberName || r.memberEmail || "" },
  );
}

/** Teams and active members a grant can target, scoped to one workspace. */
export async function listGrantTargets(organizationId: string) {
  const teams = await db
    .select({ id: team.id, name: team.name })
    .from(team)
    .where(eq(team.organizationId, organizationId))
    .orderBy(asc(team.name));
  const members = await db
    .select({ publicId: member.publicId, name: users.name, email: users.email })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(and(eq(member.organizationId, organizationId), eq(member.status, "active")));
  return {
    teams,
    members: members.map((m) => ({ publicId: m.publicId, label: m.name || m.email })),
  };
}
