import { eq, count } from "drizzle-orm";
import { PageShell } from "@foundry/design-system";
import { SettingsPage, SettingsRow, SettingsSection } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { db } from "@/db/client";
import { organization, tenants } from "@/db/schema";
import { requireActiveOrganizationId } from "@/lib/auth/active-org";
import { requirePagePermission } from "@/lib/auth/guards";
import { countOrganizationSendsThisMonth } from "@/lib/tenants/usage";

export const dynamic = "force-dynamic";

export const metadata = { title: "General" };

/** A limit of 0 means unlimited. */
function ofLimit(used: number, limit: number) {
  return limit === 0 ? "No limit" : `${used.toLocaleString("en")} of ${limit.toLocaleString("en")}`;
}

export default async function GeneralSettingsPage() {
  await requirePagePermission({ settings: ["read"] });
  const organizationId = await requireActiveOrganizationId();
  const [[org], [{ apps }], sent] = await Promise.all([
    db
      .select({ name: organization.name, maxApps: organization.maxApps, monthlyMessageQuota: organization.monthlyMessageQuota })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1),
    db.select({ apps: count() }).from(tenants).where(eq(tenants.organizationId, organizationId)),
    countOrganizationSendsThisMonth(organizationId),
  ]);

  return (
    <PageShell>
      <ViewHeader title="General" />
      <SettingsPage title="General">
        <SettingsSection title="Workspace" description="Limits are set by Relay.">
          <SettingsRow label="Name">
            <span className="text-sm text-muted-foreground">{org?.name ?? "Workspace"}</span>
          </SettingsRow>
          <SettingsRow label="Apps">
            <span className="text-sm text-muted-foreground">{ofLimit(apps, org?.maxApps ?? 0)}</span>
          </SettingsRow>
          <SettingsRow label="Monthly sends" description="Counted across every app in this workspace.">
            <span className="text-sm text-muted-foreground">{ofLimit(sent, org?.monthlyMessageQuota ?? 0)}</span>
          </SettingsRow>
        </SettingsSection>
      </SettingsPage>
    </PageShell>
  );
}
