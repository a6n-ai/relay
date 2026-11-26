import { Button } from "@foundry/ui/button";
import { TextField } from "../../components/form/text-field";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import MegaphoneIcon from "lucide-react/icons/megaphone";
import { type FormEvent, useEffect, useState } from "react";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText, isNotFound } from "../../components/error-text";
import { EmptyState } from "../../components/page/empty-state";
import { PageLocalHint } from "../../components/page/page-local-hint";
import { AppField, needsAppChoice } from "../../components/form/app-field";
import { ChoiceField } from "../../components/form/choice-field";
import { FilterMenu } from "../../components/page/filter-menu";
import { ResourceGrid } from "../../components/page/resource-grid";
import { ViewToggle } from "../../components/page/view-toggle";
import { type View, viewPref } from "../../components/page/view-pref";
import { Hint } from "../../components/page/text";
import { LoadMore } from "../../components/page/load-more";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ResourceTable } from "../../components/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { useNewParam } from "../../components/shell/new-param";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { fetchApps } from "../../console/apps.fns";
import { createCampaignFn, fetchCampaigns } from "../../console/campaigns.fns";
import { fetchTemplates } from "../../console/templates.fns";
import { formatWhen } from "../../lib/format-date";
import { FormError, FormBody, FormActions } from "../../components/page/form-parts";

type CampaignsSearch = { appId?: string; cursor?: string; offset?: number; new?: 1; q?: string; status?: string };

const PAGE = 50;
const ROUTE = "/campaigns";

export const Route = createFileRoute("/_app/campaigns")({
  validateSearch: (search: Record<string, unknown>): CampaignsSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
    cursor: typeof search.cursor === "string" && search.cursor ? search.cursor : undefined,
    offset: typeof search.offset === "number" && search.offset > 0 ? Math.floor(search.offset) : undefined,
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    status: typeof search.status === "string" && search.status ? search.status : undefined,
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId, cursor: search.cursor }),
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Campaigns" }]} columns={5} search filter view action />,
  loader: async ({ deps }) => {
    const apps = await fetchApps();
    if (!apps) return null;
    const appId = deps.appId ?? apps[0]?.id;
    if (!appId) return { apps, appId, campaigns: { rows: [], nextCursor: null }, templates: [] };
    const campaigns = await fetchCampaigns({ data: { appId, cursor: deps.cursor } }).catch((err) => {
      if (isNotFound(err)) return { missing: true as const };
      throw err;
    });
    if (!campaigns) return null;
    if ("missing" in campaigns) return campaigns;
    // The template picker is optional, so a failed template read leaves a blank campaign only.
    const templates = (await fetchTemplates({ data: { appId } }).catch(() => null))?.rows ?? [];
    return { apps, appId, campaigns, templates };
  },
  component: CampaignsPage,
});

const CRUMBS = [{ label: "Campaigns" }];

function CampaignsPage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const search = Route.useSearch();
  const canWrite = useCan({ campaign: ["write"] });
  const [open, setOpen] = useNewParam();
  const [query, setQuery] = useUrlFilter("q");
  const navigate = useNavigate({ from: "/campaigns" });
  const [view, setView] = useState<View>(() => viewPref.read(ROUTE));
  if (!page) {
    return (
      <>
        <PageHeader crumbs={CRUMBS} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in page) {
    return (
      <>
        <PageHeader crumbs={CRUMBS} />
        <DeniedState reason="not-found" label="App not found" />
      </>
    );
  }
  const { apps, appId, campaigns, templates } = page;
  const empty =
    campaigns.rows.length === 0 ? (
      <EmptyState icon={MegaphoneIcon} title="No campaigns yet." action={canWrite && appId ? <Button variant="outline" onClick={() => setOpen(true)}>New campaign</Button> : undefined} />
    ) : (
      search.status && campaigns.nextCursor ? "None on this page" : "No campaigns match."
    );
  const create =
    canWrite && appId ? (
      <CreateDialog title="New campaign" open={open} onOpenChange={setOpen}>
        {(done) => <NewCampaignForm apps={apps} appId={appId} scopedAppId={search.appId} templates={templates} done={done} />}
      </CreateDialog>
    ) : null;
  const newButton = canWrite && appId ? <Button onClick={() => setOpen(true)}>New campaign</Button> : null;
  const q = query.trim().toLowerCase();
  const rows = campaigns.rows.filter((c) => (!search.status || c.status === search.status) && (!q || c.name.toLowerCase().includes(q)));
  const facets = [
    { key: "status", label: "Status", options: [...new Set(campaigns.rows.map((c) => c.status))].map((s) => ({ value: s, label: `${s[0]?.toUpperCase()}${s.slice(1)}` })) },
    { key: "appId", label: "App", options: apps.map((a) => ({ value: a.id, label: a.name })) },
  ];
  const showApp = !search.appId;
  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? "—";
  const when = (c: (typeof rows)[number]) => {
    const at = c.finishedAt ?? c.scheduledAt;
    return at ? formatWhen(at) : "—";
  };
  const openRow = (c: (typeof rows)[number]) => ({ to: "/campaigns/$campaignId" as const, params: { campaignId: c.id }, search: { appId: c.appId } });
  return (
    <>
      <PageHeader crumbs={CRUMBS} />
      <Toolbar
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search campaigns" />}
        filters={<FilterMenu facets={facets} value={search} onChange={(next) => navigate({ search: next as never, replace: true })} />}
        view={<ViewToggle route={ROUTE} value={view} onChange={setView} />}
      >
        {newButton}
      </Toolbar>
      {create}
      <PageLocalHint active={Boolean(search.status)} hasMore={Boolean(campaigns.nextCursor)} />
      {view === "grid" ? (
        <ResourceGrid
          items={rows}
          rowKey={(c) => c.id}
          href={openRow}
          rowLabel={(c) => `Open ${c.name}`}
          menu={(c) => [{ label: "Open", ...openRow(c) }]}
          empty={empty}
          card={(c) => (
            <div className="grid gap-1.5 pr-8">
              <span className="font-medium">{c.name}</span>
              <span>
                <StatusBadge status={c.status} />
              </span>
              {showApp ? <Hint size="xs">{appName(c.appId)}</Hint> : null}
              <Hint size="xs">
                {when(c)} · {c.recipients} recipients
              </Hint>
            </div>
          )}
        />
      ) : (
        <ResourceTable
          offset={search.cursor ? search.offset : undefined}
          columns={[
            { header: "Name", kind: "name", cell: (c) => c.name },
            { header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
            ...(showApp ? [{ header: "App", cell: (c: (typeof rows)[number]) => appName(c.appId) }] : []),
            { header: "Scheduled or sent", cell: when },
            { header: "Recipients", numeric: true, cell: (c) => c.recipients },
          ]}
          rows={rows}
          rowKey={(c) => c.id}
          rowHref={openRow}
          rowLabel={(c) => `Open ${c.name}`}
          menu={(c) => [{ label: "Open", ...openRow(c) }]}
          empty={empty}
        />
      )}
      <LoadMore
        hasMore={Boolean(campaigns.nextCursor)}
        to="/campaigns"
        offset={search.cursor ? search.offset : undefined}
        pageSize={PAGE}
        search={{ appId: search.appId, q: search.q, status: search.status, cursor: campaigns.nextCursor }}
        resetTo={search.cursor ? "/campaigns" : undefined}
        resetSearch={{ appId: search.appId, q: search.q, status: search.status }}
      />
    </>
  );
}

type TemplateChoice = { id: string; name: string; subject?: string };

function NewCampaignForm({
  apps,
  appId,
  scopedAppId,
  templates,
  done,
}: {
  apps: { id: string; name: string }[];
  appId: string;
  scopedAppId?: string;
  templates: TemplateChoice[];
  done: () => void;
}) {
  const navigate = useNavigate();
  const [app, setApp] = useState(appId);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("blank");
  const [choices, setChoices] = useState(templates);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Templates belong to one app, so they reload when the dialog's app changes.
  useEffect(() => {
    setTemplate("blank");
    if (app === appId) {
      setChoices(templates);
      return;
    }
    let live = true;
    fetchTemplates({ data: { appId: app } })
      .then((t) => live && setChoices(t?.rows ?? []))
      .catch(() => live && setChoices([]));
    return () => {
      live = false;
    };
  }, [app, appId, templates]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const templateId = template !== "blank" ? template : undefined;
      const campaign = await createCampaignFn({ data: { appId: app, name, templateId } });
      toast.success("Campaign created");
      done();
      await navigate({ to: "/campaigns/$campaignId", params: { campaignId: campaign.id }, search: { appId: app } });
    } catch (err) {
      setError(errorText(err, "Could not create this campaign."));
    } finally {
      setPending(false);
    }
  }
  const choose = needsAppChoice(apps, scopedAppId);
  return (
    <FormBody onSubmit={submit}>
      <AppField apps={apps} scopedAppId={scopedAppId} value={app} onChange={setApp} id="campaign-app" autoFocus={choose} />
      <TextField id="campaign-name" label="Name" autoFocus={!choose} required placeholder="Spring newsletter" value={name} onChange={(e) => setName(e.target.value)} />
      <ChoiceField
        id="campaign-template"
        label="Start from"
        value={template}
        onChange={setTemplate}
        options={[
          { value: "blank", label: "Blank campaign", description: "Write it from scratch." },
          ...choices.map((t) => ({ value: t.id, label: t.name, description: t.subject || "Copies this template's content." })),
        ]}
      />
      <FormError message={error} />
      <FormActions cancel pending={pending} pendingLabel="Creating…" submitLabel="Create campaign" disabled={!name.trim()} disabledReason="Enter a name first." />
    </FormBody>
  );
}
