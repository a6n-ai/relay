import { createFileRoute } from "@tanstack/react-router";
import { AutomationForm } from "../../components/automation-form";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { NoAppState } from "../../components/page/no-app-state";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { fetchApps } from "../../console/apps.fns";

export const Route = createFileRoute("/_app/campaigns_/automations_/new")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
  }),
  loader: async () => ({ apps: (await fetchApps()) ?? [] }),
  component: NewAutomationPage,
});

const crumbs = [
  { label: "Campaigns", to: "/campaigns" },
  { label: "Automations", to: "/campaigns/automations" },
  { label: "New automation" },
];

function NewAutomationPage() {
  const { apps } = Route.useLoaderData();
  const { appId: scopeParam } = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const canSend = useCan({ campaign: ["send"] });
  if (!canSend) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if (apps.length === 0) return <NoAppState crumbs={crumbs} what="Automations" />;
  const scopedAppId = apps.some((a) => a.id === scopeParam) ? scopeParam : undefined;
  return (
    <>
      <PageHeader crumbs={crumbs} description="Send a template automatically when someone joins a list." />
      <AutomationForm apps={apps} appId={scopedAppId ?? apps[0]?.id ?? ""} scopedAppId={scopedAppId} />
    </>
  );
}
