import { createFileRoute, useSearch } from "@tanstack/react-router";
import { AutomationForm } from "../../components/campaigns/automation-form";
import { PageDenied } from "../../components/page/page-denied";
import { isNotFound } from "../../components/lib/scoped-load";
import { FormSkeleton } from "../../components/page/page-skeleton";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/lib/use-can";
import { fetchAutomation } from "../../console/automations.fns";
import { fetchCampaignOptions } from "../../console/campaigns.fns";
import { str } from "../../components/lib/route-search";
import type { Crumb } from "../../components/shell/page-header";

export const Route = createFileRoute("/_app/campaigns_/automations_/$automationId")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: str(search.appId),
  }),
  loader: async ({ params }) => {
    const automation = await fetchAutomation({ data: { id: params.automationId } });
    if (!automation) return null;
    if ("missing" in automation) return automation;
    const options = await fetchCampaignOptions({ data: { appId: automation.appId } }).catch((err) => {
      if (isNotFound(err)) return null;
      throw err;
    });
    return { automation, listName: options?.lists.find((l) => l.id === automation.listId)?.name };
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
  const crumbs = (label: string): Crumb[] => [
    { label: "Campaigns", to: "/campaigns", search: { appId } },
    { label: "Automations", to: "/campaigns/automations", search: { appId } },
    { label },
  ];
  if (!page || !canSend) {
    return <PageDenied crumbs={crumbs("Automation")} />;
  }
  if ("missing" in page) {
    return <PageDenied crumbs={crumbs("Automation")} reason="not-found" label="Automation not found" />;
  }
  const { automation, listName } = page;
  return (
    <>
      <PageHeader crumbs={crumbs(automation.name)} description="Settings for this automation." />
      <AutomationForm key={automation.id} apps={shell.apps} appId={automation.appId} automation={automation} listName={listName} />
    </>
  );
}
