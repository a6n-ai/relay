import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { member } from "@/db/schema";

/**
 * If the signed-in user has active org memberships but no active workspace, activate
 * the first one so app lists are scoped. No-op when already set or none exist.
 */
export async function ensureActiveOrganization(): Promise<void> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user) return;
  if (session.session.activeOrganizationId) return;

  const orgs = await auth.api.listOrganizations({ headers: h });
  const activeRows = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, BigInt(session.user.id)), eq(member.status, "active")));
  const activeIds = new Set(activeRows.map((r) => r.organizationId));
  const first = Array.isArray(orgs) ? orgs.find((o) => activeIds.has(o.id)) : null;
  if (!first?.id) return;

  await auth.api.setActiveOrganization({
    headers: h,
    body: { organizationId: first.id },
  });
}
