import { createFileRoute } from "@tanstack/react-router";
import { AutomationForm } from "../../components/campaigns/automation-form";
import { PageDenied } from "../../components/page/page-denied";
import { NoAppState } from "../../components/page/no-app-state";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { str } from "../../components/lib/route-search";

export const Route = createFileRoute("/_app/campaigns_/automations_/new")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: str(search.appId),
  }),
  component: NewAutomationPage,
});

const crumbs = [
  { label: "Campaigns", to: "/campaigns" },
  { label: "Automations", to: "/campaigns/automations" },
  { label: "New automation" },
];

function NewAutomationPage() {
  const { appId: scopeParam } = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const { apps } = shell;
  const canSend = useCan({ campaign: ["send"] });
  if (!canSend) {
    return <PageDenied crumbs={crumbs} />;
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
