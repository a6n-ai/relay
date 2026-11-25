import { createFileRoute } from "@tanstack/react-router";
import { SettingsCard } from "../../components/page/settings-card";
import { PageHeader } from "../../components/shell/page-header";
import { SectionTitle } from "../../components/page/text";

export const Route = createFileRoute("/_app/settings")({
  component: GeneralPage,
});

function GeneralPage() {
  const { shell } = Route.useRouteContext();
  const active = shell.active;
  const suspended = active?.status === "suspended";
  return (
    <>
      <PageHeader crumbs={[{ label: "Settings", to: "/settings" }, { label: "General" }]} />
      <div className="grid max-w-2xl gap-4 p-4">
        {suspended ? (
          <SettingsCard
            title="Workspace suspended"
            description="Sending and changes are paused while the workspace is suspended. Contact support to resume it."
            tone="danger"
          />
        ) : null}
        <SettingsCard title="Workspace name" description="The name shown in the workspace switcher.">
          <SectionTitle as="p">{active?.name ?? "—"}</SectionTitle>
        </SettingsCard>
      </div>
    </>
  );
}
