import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AppSelect } from "../../components/app-select";
import { CampaignsTabs } from "../../components/campaigns-tabs";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText, isNotFound } from "../../components/error-text";
import { formatWhen } from "../../components/event-timeline";
import { FormError } from "../../components/form-error";
import { ResourceTable } from "../../components/resource-table";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { ViewHeader } from "../../components/view-header";
import { fetchApps } from "../../console/apps.fns";
import { createCampaignFn, fetchCampaigns } from "../../console/campaigns.fns";
import { fetchTemplates } from "../../console/templates.fns";

type CampaignsSearch = { appId?: string };

export const Route = createFileRoute("/_app/campaigns")({
  validateSearch: (search: Record<string, unknown>): CampaignsSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const apps = await fetchApps();
    if (!apps) return null;
    const appId = deps.appId ?? apps[0]?.id;
    if (!appId) return { apps, appId, campaigns: { rows: [], nextCursor: null }, templates: [] };
    const campaigns = await fetchCampaigns({ data: { appId } }).catch((err) => {
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

function CampaignsPage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const navigate = useNavigate({ from: "/campaigns" });
  const canWrite = useCan({ campaign: ["write"] });
  if (!page) {
    return (
      <>
        <ViewHeader title="Campaigns" />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in page) {
    return (
      <>
        <ViewHeader title="Campaigns" />
        <DeniedState reason="not-found" label="App not found" />
      </>
    );
  }
  const { apps, appId, campaigns, templates } = page;
  return (
    <>
      <ViewHeader
        title="Campaigns"
        actions={
          canWrite && appId ? (
            <CreateDialog trigger="New campaign" title="New campaign">
              {(done) => <NewCampaignForm apps={apps} appId={appId} templates={templates} done={done} />}
            </CreateDialog>
          ) : undefined
        }
      />
      <CampaignsTabs active="campaigns" appId={appId} />
      <div className="grid gap-4 p-4">
        {apps.length > 0 ? (
          <AppSelect
            apps={apps}
            value={appId ?? ""}
            onValueChange={(value) => navigate({ search: { appId: value } })}
            className="w-full sm:max-w-xs"
          />
        ) : null}
        <ResourceTable
          columns={[
            {
              header: "Name",
              cell: (c) => (
                <Link
                  to="/campaigns/$campaignId"
                  params={{ campaignId: c.id }}
                  search={{ appId: c.appId }}
                  className="font-medium hover:underline"
                >
                  {c.name}
                </Link>
              ),
            },
            { header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
            { header: "App", cell: (c) => apps.find((a) => a.id === c.appId)?.name ?? "" },
            {
              header: "Scheduled or sent",
              cell: (c) => {
                const at = c.finishedAt ?? c.scheduledAt;
                return at ? formatWhen(at) : "Not scheduled";
              },
            },
            { header: "Recipients", cell: (c) => <span className="tabular-nums">{c.recipients}</span> },
          ]}
          rows={campaigns.rows}
          rowKey={(c) => c.id}
          empty="No campaigns yet"
        />
      </div>
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
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="campaign-app">App</Label>
      <AppSelect apps={apps} value={app} onValueChange={setApp} id="campaign-app" />
      <Label htmlFor="campaign-name">Name</Label>
      <Input id="campaign-name" required value={name} onChange={(e) => setName(e.target.value)} />
      {pickable ? (
        <>
          <Label htmlFor="campaign-template">Start from</Label>
          <Select value={template} onValueChange={(v) => setTemplate(v ?? "blank")}>
            <SelectTrigger id="campaign-template" aria-label="Start from" className="w-full">
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
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !name.trim() || !app}>
          Create
        </Button>
      </div>
    </form>
  );
}
