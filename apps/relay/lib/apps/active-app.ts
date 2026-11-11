import { cookies } from "next/headers";
import { ACTIVE_APP_COOKIE } from "@/lib/apps/active-app-cookie";
import { tenantsService } from "@/lib/services/tenants.service";

export { ACTIVE_APP_COOKIE } from "@/lib/apps/active-app-cookie";

export async function getActiveAppPublicId(): Promise<string | null> {
  const value = (await cookies()).get(ACTIVE_APP_COOKIE)?.value;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Resolve the app the console is operating on: cookie match inside the active
 * workspace, else the first app, else null (empty workspace).
 */
export async function resolveActiveApp() {
  const { items } = await tenantsService.listRecent();
  if (items.length === 0) return null;
  const cookieId = await getActiveAppPublicId();
  return items.find((a) => a.publicId === cookieId) ?? items[0] ?? null;
}
