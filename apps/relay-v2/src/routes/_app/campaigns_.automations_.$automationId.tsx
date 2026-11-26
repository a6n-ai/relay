import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { AutomationForm } from "../../components/automation-form";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { isNotFound } from "../../components/error-text";
import { DangerCard } from "../../components/page/danger-card";
import { FormSkeleton } from "../../components/page/page-skeleton";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { fetchApps } from "../../console/apps.fns";
import { deleteAutomationFn, fetchAutomations } from "../../console/automations.fns";
import { fetchCampaignOptions } from "../../console/campaigns.fns";

export const Route = createFileRoute("/_app/campaigns_/automations_/$automationId")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId }),
  loader: async ({ deps, params }) => {
    if (!deps.appId) return { missing: true as const };
    const [automations, options, apps] = await Promise.all([
      fetchAutomations({ data: { appId: deps.appId } }),
      fetchCampaignOptions({ data: { appId: deps.appId } }).catch((err) => {
        if (isNotFound(err)) return null;
        throw err;
      }),
      fetchApps(),
    ]);
    if (!automations) return null;
    if ("missing" in automations) return automations;
    const automation = automations.find((a) => a.id === params.automationId);
    if (!automation) return { missing: true as const };
    return { automation, apps: apps ?? [], listName: options?.lists.find((l) => l.id === automation.listId)?.name };
  },
  pendingComponent: () => <FormSkeleton crumbs={[{ label: "Campaigns", to: "/campaigns" }, { label: "Automations", to: "/campaigns/automations" }, { label: "Automation" }]} cards={3} action />,
  component: AutomationPage,
});

function AutomationPage() {
  const page = Route.useLoaderData();
  const { appId } = useSearch({ strict: false }) as { appId?: string };
  const { shell } = Route.useRouteContext();
  const canSend = useCan({ campaign: ["send"] });
  const navigate = useNavigate();
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
  async function remove() {
    await deleteAutomationFn({ data: { id: automation.id } });
    toast.success("Automation deleted", { description: automation.name });
    await navigate({ to: "/campaigns/automations", search: { appId: automation.appId } });
  }
  return (
    <>
      <PageHeader crumbs={crumbs(automation.name)} description="Settings for this automation." />
      <AutomationForm key={automation.id} apps={apps} appId={automation.appId} automation={automation} listName={listName} />
      <div className="grid max-w-2xl gap-4 px-4 pb-8">
        <DangerCard
          title="Delete this automation"
          description="Messages waiting to go out are dropped. Mail already sent is unaffected."
          buttonLabel="Delete automation"
          confirmTitle={`Delete ${automation.name}?`}
          onConfirm={remove}
        />
      </div>
    </>
  );
}
