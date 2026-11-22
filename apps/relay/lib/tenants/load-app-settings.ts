import { requireActiveOrganizationId } from "@/lib/auth/active-org";
import { tenantsService } from "@/lib/services/tenants.service";

/** The app when it belongs to the active workspace; another workspace's app reads as missing. */
export async function loadAppSettings(publicId: string) {
  const [tenant, organizationId] = await Promise.all([
    tenantsService.read(publicId).catch(() => null),
    requireActiveOrganizationId(),
  ]);
  if (!tenant || tenant.organizationId !== organizationId) return null;
  return { tenant };
}
