import { createFileRoute, useSearch } from "@tanstack/react-router";
import { AutomationForm } from "../../components/campaigns/automation-form";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { isNotFound } from "../../components/lib/scoped-load";
import { FormSkeleton } from "../../components/page/page-skeleton";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { fetchApps } from "../../console/apps.fns";
import { fetchAutomation } from "../../console/automations.fns";
import { fetchCampaignOptions } from "../../console/campaigns.fns";
import { str } from "../../components/lib/route-search";

export const Route = createFileRoute("/_app/campaigns_/automations_/$automationId")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: str(search.appId),
  }),
  loader: async ({ params }) => {
    const automation = await fetchAutomation({ data: { id: params.automationId } });
    if (!automation) return null;
    if ("missing" in automation) return automation;
    const [options, apps] = await Promise.all([
      fetchCampaignOptions({ data: { appId: automation.appId } }).catch((err) => {
        if (isNotFound(err)) return null;
        throw err;
      }),
      fetchApps(),
    ]);
    return { automation, apps: apps ?? [], listName: options?.lists.find((l) => l.id === automation.listId)?.name };
  },
  pendingComponent: () => <FormSkeleton crumbs={[{ label: "Campaigns", to: "/campaigns" }, { label: "Automations", to: "/campaigns/automations" }, { label: "Automation" }]} cards={3} action />,
  component: AutomationPage,
});

function AutomationPage() {
  const page = Route.useLoaderData();
  const search = useSearch({ strict: false }) as { appId?: string };
  const appId = search.appId ?? (page && "automation" in page ? page.automation.appId : undefined);
  const { shell } = Route.useRouteContext();
  const canSend = useCan({ campaign: ["send"] });
  const crumbs = (label: string) => [
    { label: "Campaigns", to: "/campaigns", search: { appId } },
    { label: "Automations", to: "/campaigns/automations", search: { appId } },
    { label },
  ];
  if (!page || !canSend) {
    return (
      <>
        <PageHeader crumbs={crumbs("Automation")} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in page) {
    return (
      <>
        <PageHeader crumbs={crumbs("Automation")} />
        <DeniedState reason="not-found" label="Automation not found" />
      </>
    );
  }
  const { automation, apps, listName } = page;
  return (
    <>
      <PageHeader crumbs={crumbs(automation.name)} description="Settings for this automation." />
      <AutomationForm key={automation.id} apps={apps} appId={automation.appId} automation={automation} listName={listName} />
    </>
  );
}
