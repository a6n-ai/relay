import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mailboxGrant, member, tenantMailboxes, tenants } from "@/db/schema";
import { grantKey, type GridColumn } from "@/components/settings/mailbox-access-state";
import { listGrantTargets } from "./grants";

export type AccessGrid = {
  mailboxes: { id: bigint; publicId: string; email: string; appName: string }[];
  columns: GridColumn[];
  grants: Record<string, string>;
};

/** Mailbox x team/person grid for one workspace, or for one app when `tenantId` is given. */
export async function loadAccessGrid(organizationId: string, opts: { tenantId?: bigint } = {}): Promise<AccessGrid> {
  const forApp = opts.tenantId === undefined ? undefined : eq(tenantMailboxes.tenantId, opts.tenantId);

  const [mailboxes, grantRows, targets] = await Promise.all([
    db
      .select({
        id: tenantMailboxes.id,
        publicId: tenantMailboxes.publicId,
        email: tenantMailboxes.email,
        appName: tenants.name,
      })
      .from(tenantMailboxes)
      .innerJoin(tenants, eq(tenants.id, tenantMailboxes.tenantId))
      .where(and(eq(tenants.organizationId, organizationId), forApp))
      .orderBy(asc(tenants.name), asc(tenantMailboxes.email)),
    db
      .select({
        publicId: mailboxGrant.publicId,
        mailboxPublicId: tenantMailboxes.publicId,
        teamId: mailboxGrant.teamId,
        memberPublicId: member.publicId,
      })
      .from(mailboxGrant)
      .innerJoin(tenantMailboxes, eq(tenantMailboxes.id, mailboxGrant.mailboxId))
      .innerJoin(tenants, eq(tenants.id, tenantMailboxes.tenantId))
      .leftJoin(member, eq(member.id, mailboxGrant.memberId))
      .where(and(eq(mailboxGrant.organizationId, organizationId), eq(tenants.organizationId, organizationId), forApp)),
    listGrantTargets(organizationId),
  ]);

  const columns: GridColumn[] = [
    ...targets.teams.map((t): GridColumn => ({ kind: "team", teamId: t.id, label: t.name })),
    ...targets.members.map((m): GridColumn => ({ kind: "member", memberPublicId: m.publicId, label: m.label })),
  ];

  const grants: Record<string, string> = {};
  for (const g of grantRows) {
    if (g.teamId) grants[grantKey(g.mailboxPublicId, { teamId: g.teamId })] = g.publicId;
    else if (g.memberPublicId) grants[grantKey(g.mailboxPublicId, { memberPublicId: g.memberPublicId })] = g.publicId;
  }

  return { mailboxes, columns, grants };
}
