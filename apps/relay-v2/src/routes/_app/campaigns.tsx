import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import MegaphoneIcon from "lucide-react/icons/megaphone";
import { type FormEvent, useState } from "react";
import { AppSelect } from "../../components/app-select";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText, isNotFound } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { EmptyState } from "../../components/page/empty-state";
import { LoadMore } from "../../components/page/load-more";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ResourceTable } from "../../components/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { useNewParam } from "../../components/shell/create-menu";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { fetchApps } from "../../console/apps.fns";
import { createCampaignFn, fetchCampaigns } from "../../console/campaigns.fns";
import { fetchTemplates } from "../../console/templates.fns";
import { formatWhen } from "../../lib/format-date";
import { FormBody, FormActions } from "../../components/page/form-parts";

type CampaignsSearch = { appId?: string; cursor?: string; new?: 1; q?: string; status?: string };

export const Route = createFileRoute("/_app/campaigns")({
  validateSearch: (search: Record<string, unknown>): CampaignsSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
    cursor: typeof search.cursor === "string" && search.cursor ? search.cursor : undefined,
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    status: typeof search.status === "string" && search.status ? search.status : undefined,
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId, cursor: search.cursor }),
  pendingComponent: () => <TableSkeleton columns={5} />,
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
  const status = search.status ?? "all";
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
  const create =
    canWrite && appId ? (
      <CreateDialog title="New campaign" open={open} onOpenChange={setOpen}>
        {(done) => <NewCampaignForm apps={apps} appId={appId} templates={templates} done={done} />}
      </CreateDialog>
    ) : null;
  const newButton = canWrite && appId ? <Button onClick={() => setOpen(true)}>New campaign</Button> : null;
  const q = query.trim().toLowerCase();
  const rows = campaigns.rows.filter((c) => (status === "all" || c.status === status) && (!q || c.name.toLowerCase().includes(q)));
  const statuses = [...new Set(campaigns.rows.map((c) => c.status))];
  return (
    <>
      <PageHeader crumbs={CRUMBS} />
      <Toolbar
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search campaigns" />}
        filters={
          statuses.length > 1 ? (
            <Select value={status} onValueChange={(v) => navigate({ search: (s) => ({ ...s, status: !v || v === "all" ? undefined : v, cursor: undefined }), replace: true })}>
              <SelectTrigger aria-label="Status" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s[0]?.toUpperCase()}
                    {s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      >
        {newButton}
      </Toolbar>
      {create}
      <ResourceTable
        columns={[
          { header: "Name", kind: "name", cell: (c) => c.name },
          { header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
          ...(search.appId ? [] : [{ header: "App", cell: (c: (typeof rows)[number]) => apps.find((a) => a.id === c.appId)?.name ?? "—" }]),
          {
            header: "Scheduled or sent",
            cell: (c) => {
              const at = c.finishedAt ?? c.scheduledAt;
              return at ? formatWhen(at) : "—";
            },
          },
          { header: "Recipients", numeric: true, cell: (c) => c.recipients },
        ]}
        rows={rows}
        rowKey={(c) => c.id}
        rowHref={(c) => ({ to: "/campaigns/$campaignId", params: { campaignId: c.id }, search: { appId: c.appId } })}
        rowLabel={(c) => `Open ${c.name}`}
        menu={(c) => [{ label: "Open", to: "/campaigns/$campaignId", params: { campaignId: c.id }, search: { appId: c.appId } }]}
        empty={
          campaigns.rows.length === 0 ? (
            <EmptyState icon={MegaphoneIcon} title="No campaigns yet." action={newButton} />
          ) : (
            "No campaigns match."
          )
        }
      />
      <LoadMore
        hasMore={Boolean(campaigns.nextCursor)}
        to="/campaigns"
        search={{ appId: search.appId, q: search.q, status: search.status, cursor: campaigns.nextCursor }}
        resetTo={search.cursor ? "/campaigns" : undefined}
        resetSearch={{ appId: search.appId, q: search.q, status: search.status }}
      />
    </>
  );
}

function NewCampaignForm({
  apps,
  appId,
  templates,
  done,
}: {
  apps: { id: string; name: string }[];
  appId: string;
  templates: { id: string; name: string }[];
  done: () => void;
}) {
  const navigate = useNavigate();
  const [app, setApp] = useState(appId);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("blank");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The templates were loaded for the page's app, so they only apply while that app is chosen.
  const pickable = app === appId && templates.length > 0;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const templateId = pickable && template !== "blank" ? template : undefined;
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
  return (
    <FormBody onSubmit={submit}>
      <Label htmlFor="campaign-app">App</Label>
      <AppSelect apps={apps} value={app} onValueChange={setApp} id="campaign-app" />
      <Label htmlFor="campaign-name">Name</Label>
      <Input id="campaign-name" required value={name} onChange={(e) => setName(e.target.value)} />
      {pickable ? (
        <>
          <Label htmlFor="campaign-template">Start from</Label>
          <Select value={template} onValueChange={(v) => setTemplate(v ?? "blank")}>
            <SelectTrigger id="campaign-template" aria-label="Start from">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blank">Blank campaign</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : null}
      <FormError message={error} />
      <FormActions>
        <Button type="submit" disabled={pending || !name.trim() || !app}>
          Create campaign
        </Button>
      </FormActions>
    </FormBody>
  );
}
