import { Button } from "@foundry/ui/button";
import WorkflowIcon from "lucide-react/icons/workflow";
import { Switch } from "@foundry/ui/switch";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { FilterMenu } from "../../components/page/filter-menu";
import { ResourceCard, ResourceGrid } from "../../components/page/resource-grid";
import { type View, viewPref } from "../../components/page/view-pref";
import { ViewToggle } from "../../components/page/view-toggle";
import { EmptyState } from "../../components/page/empty-state";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { Toolbar } from "../../components/page/toolbar";
import { ResourceTable } from "../../components/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { confirmAction, runAction } from "../../components/run-action";
import { useCan } from "../../components/use-can";
import { deleteAutomationFn, enableAutomationFn, fetchAutomations } from "../../console/automations.fns";
import { fetchCampaignOptions } from "../../console/campaigns.fns";
import { fetchTemplates } from "../../console/templates.fns";
import { type AutomationView } from "../../shared/views";
import { oneOf, str, untyped } from "../../lib/route-search";
import { loaded, ScopedDenied } from "../../components/page/scoped-page";
import { scopedLoad } from "../../lib/scoped-load";

type AutomationsSearch = { appId?: string; status?: "on" | "off" };

const ROUTE = "/campaigns/automations";

export const Route = createFileRoute("/_app/campaigns_/automations")({
  staticData: { title: "Automations", copy: "Emails that send themselves when something happens in an app.", scoped: "first" },
  validateSearch: (search: Record<string, unknown>): AutomationsSearch => ({
    appId: str(search.appId),
    status: oneOf(["on", "off"] as const, search.status),
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId }),
  pendingComponent: () => <ListSkeleton columns={7} filter view action />,
  loader: ({ deps }) =>
    scopedLoad(
      deps.appId,
      async (appId) => {
        const automations = await fetchAutomations({ data: { appId } });
        if (!automations || "missing" in automations) return automations;
        // Names are only labels in the table, so a failed read leaves the ids visible instead of hiding the page.
        const [options, templates] = await Promise.all([fetchCampaignOptions({ data: { appId } }), fetchTemplates({ data: { appId } })]);
        return { automations, lists: options?.lists ?? [], templates: templates?.rows ?? [] };
      },
      { automations: [], lists: [], templates: [] },
    ),
  component: AutomationsPage,
});


function AutomationsPage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const search = Route.useSearch();
  const router = useRouter();
  const canSend = useCan({ campaign: ["send"] });
  const navigate = useNavigate({ from: "/campaigns/automations" });
  const [view, setView] = useState<View>(() => viewPref.read(ROUTE));
  const [deleting, setDeleting] = useState<AutomationView | null>(null);
  if (!loaded(page)) return <ScopedDenied page={page} shell={shell} />;
  const { apps, appId, automations, lists, templates } = page;
  const canCreate = canSend && Boolean(appId);
  const newButton = canCreate ? <Button render={<Link to="/campaigns/automations/new" search={{ appId: search.appId }} />}>New automation</Button> : null;
  const rows = automations.filter((a) => !search.status || a.enabled === (search.status === "on"));
  const facets = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "on", label: "On" },
        { value: "off", label: "Off" },
      ],
    },
  ];
  const showApp = !search.appId;
  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? "—";
  const listName = (id: string) => lists.find((l) => l.id === id)?.name ?? "—";
  const templateName = (id: string) => templates.find((t) => t.id === id)?.name ?? "—";
  const delayText = (a: AutomationView) => (a.delayHours === 0 ? "Right away" : `After ${a.delayHours} ${a.delayHours === 1 ? "hour" : "hours"}`);
  const openRow = (a: AutomationView) => ({ to: "/campaigns/automations/$automationId" as const, params: { automationId: a.id }, search: { appId: a.appId } });
  const menu = (a: AutomationView) => [
    { label: "Edit", ...openRow(a), hidden: !canSend },
    { label: "Delete", onSelect: () => setDeleting(a), destructive: true, hidden: !canSend },
  ];
  const toggle = (a: AutomationView) => (
    <Switch
      checked={a.enabled}
      disabled={!canSend}
      aria-label={`Enabled for ${a.name}`}
      onCheckedChange={(on) =>
        runAction(
          () => enableAutomationFn({ data: { id: a.id, on } }),
          on ? "Automation turned on" : "Automation turned off",
          () => router.invalidate(),
        )
      }
    />
  );
  const empty =
    automations.length === 0 ? (
      <EmptyState
        icon={WorkflowIcon}
        title="No automations yet"
        description="Send a template when someone joins a list."
        action={canCreate ? <Button variant="outline" render={<Link to="/campaigns/automations/new" search={{ appId: search.appId }} />}>New automation</Button> : undefined}
      />
    ) : (
      "No automations match."
    );
  return (
    <>
      <PageHeader />
      <Toolbar
        filters={<FilterMenu facets={facets} value={search} onChange={(next) => navigate({ search: untyped(next), replace: true })} />}
        view={<ViewToggle route={ROUTE} value={view} onChange={setView} />}
      >
        {newButton}
      </Toolbar>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "automation"}?`}
        description="Waiting messages are dropped. Mail already sent is unaffected."
        confirmLabel="Delete automation"
        onConfirm={() => confirmAction(() => deleteAutomationFn({ data: { id: deleting?.id ?? "" } }), "Automation deleted", () => router.invalidate())}
      />
      {view === "grid" ? (
        <ResourceGrid
          items={rows}
          rowKey={(a) => a.id}
          href={openRow}
          rowLabel={(a) => `Open ${a.name}`}
          menu={menu}
          empty={empty}
          card={(a) => (
            <ResourceCard
              title={a.name}
              hints={[showApp && appName(a.appId), `${listName(a.listId)} · ${templateName(a.templateId)}`, `${delayText(a)} · ${a.pending} waiting · ${a.sent} sent`]}
            >
              <div>{toggle(a)}</div>
            </ResourceCard>
          )}
        />
      ) : (
        <ResourceTable
          columns={[
            { header: "Name", kind: "name", cell: (a) => a.name },
            ...(showApp ? [{ header: "App", cell: (a: AutomationView) => appName(a.appId) }] : []),
            { header: "List", secondary: true, cell: (a) => listName(a.listId) },
            { header: "Template", secondary: true, cell: (a) => templateName(a.templateId) },
            { header: "Send after", secondary: true, cell: delayText },
            { header: "Waiting", secondary: true, numeric: true, cell: (a) => a.pending },
            { header: "Sent", secondary: true, numeric: true, cell: (a) => a.sent },
            { header: "Enabled", cell: toggle },
          ]}
          rows={rows}
          rowKey={(a) => a.id}
          rowHref={openRow}
          rowLabel={(a) => `Open ${a.name}`}
          menu={menu}
          empty={empty}
        />
      )}
    </>
  );
}
