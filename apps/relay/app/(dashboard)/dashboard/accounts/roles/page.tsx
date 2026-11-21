import { PageShell } from "@foundry/design-system";
import { SettingsRow, SettingsSection } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { requirePagePermission } from "@/lib/auth/guards";
import { roleSummary } from "@/lib/auth/role-summary";
import { TeamTabs } from "../team-tabs";

export const dynamic = "force-dynamic";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  await requirePagePermission({ staff: ["read"] });

  return (
    <PageShell>
      <ViewHeader title="Roles" tabs={<TeamTabs />} />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pt-2">
        {roleSummary().map((role) => (
          <SettingsSection key={role.key} title={role.label} description={role.description}>
            {role.allows.map((a) => (
              <SettingsRow key={a.resource} label={a.label}>
                <span className="text-sm text-muted-foreground">{a.actions.join(", ")}</span>
              </SettingsRow>
            ))}
          </SettingsSection>
        ))}
        <p className="text-[13px] text-muted-foreground">Roles are set by Relay. Ask us if you need a new one.</p>
      </div>
    </PageShell>
  );
}
