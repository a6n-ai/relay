import { PageShell } from "@foundry/design-system";
import { SettingsPage, SettingsRow, SettingsSection } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { requirePagePermission } from "@/lib/auth/guards";
import { roleSummary } from "@/lib/auth/role-summary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  await requirePagePermission({ staff: ["read"] });

  return (
    <PageShell>
      <ViewHeader title="Roles" />
      <SettingsPage title="Roles" subtitle="Roles are set by Relay. Ask us if you need a new one.">
        {roleSummary().map((role) => (
          <SettingsSection key={role.key} title={role.label} description={role.description}>
            {role.allows.map((a) => (
              <SettingsRow key={a.resource} label={a.label}>
                <span className="text-sm text-muted-foreground">{a.actions.join(", ")}</span>
              </SettingsRow>
            ))}
          </SettingsSection>
        ))}
      </SettingsPage>
    </PageShell>
  );
}
