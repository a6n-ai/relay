import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Session activeOrganizationId, or null if unset / no session. */
export async function getActiveOrganizationId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const id = session?.session?.activeOrganizationId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Require an active workspace for operator console data. Redirects to the
 * workspace picker when the user is signed in but has no active org.
 */
export async function requireActiveOrganizationId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  const id = session.session?.activeOrganizationId;
  if (typeof id === "string" && id.length > 0) return id;
  redirect("/dashboard/workspaces");
}
