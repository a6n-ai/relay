import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * If the signed-in user has org memberships but no active workspace, activate
 * the first one so app lists are scoped. No-op when already set or none exist.
 */
export async function ensureActiveOrganization(): Promise<void> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user) return;
  if (session.session.activeOrganizationId) return;

  const orgs = await auth.api.listOrganizations({ headers: h });
  const first = Array.isArray(orgs) ? orgs[0] : null;
  if (!first?.id) return;

  await auth.api.setActiveOrganization({
    headers: h,
    body: { organizationId: first.id },
  });
}
