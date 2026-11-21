import { SectionTabs } from "@/components/ds/section-tabs";
import { SECTION_LABELS } from "@/components/ds/section-labels";
import { isPlatformAdmin } from "@/lib/auth/org-scope";

export async function TeamTabs() {
  const showClients = await isPlatformAdmin();
  const include = showClients
    ? undefined
    : (["/dashboard/accounts", "/dashboard/accounts/teams", "/dashboard/accounts/roles"] as const);
  return <SectionTabs section="organization" label={SECTION_LABELS.organization} include={include} />;
}
