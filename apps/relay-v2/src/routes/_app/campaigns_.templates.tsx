import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AppSelect } from "../../components/app-select";
import { CampaignsTabs } from "../../components/campaigns-tabs";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText, isNotFound } from "../../components/error-text";
import { formatWhen } from "../../components/event-timeline";
import { FormError } from "../../components/form-error";
import { ResourceTable } from "../../components/resource-table";
import { useCan } from "../../components/use-can";
import { ViewHeader } from "../../components/view-header";
import { fetchApps } from "../../console/apps.fns";
import { createTemplateFn, fetchTemplates } from "../../console/templates.fns";

type TemplatesSearch = { appId?: string };

export const Route = createFileRoute("/_app/campaigns_/templates")({
  validateSearch: (search: Record<string, unknown>): TemplatesSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const apps = await fetchApps();
    if (!apps) return null;
    const appId = deps.appId ?? apps[0]?.id;
    if (!appId) return { apps, appId, templates: { rows: [], nextCursor: null } };
    const templates = await fetchTemplates({ data: { appId } }).catch((err) => {
      if (isNotFound(err)) return { missing: true as const };
      throw err;
    });
    if (!templates) return null;
    return "missing" in templates ? templates : { apps, appId, templates };
  },
  component: TemplatesPage,
});

function TemplatesPage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const navigate = useNavigate({ from: "/campaigns/templates" });
  const canWrite = useCan({ template: ["write"] });
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
  const { apps, appId, templates } = page;
  return (
    <>
      <ViewHeader
        title="Campaigns"
        actions={
          canWrite && appId ? (
            <CreateDialog trigger="New template" title="New template">
              {(done) => <NewTemplateForm apps={apps} appId={appId} done={done} />}
            </CreateDialog>
          ) : undefined
        }
      />
      <CampaignsTabs active="templates" appId={appId} />
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
              cell: (t) => (
                <Link
                  to="/campaigns/templates/$templateId"
                  params={{ templateId: t.id }}
                  search={{ appId: t.appId }}
                  className="font-medium hover:underline"
                >
                  {t.name}
                </Link>
              ),
            },
            { header: "App", cell: (t) => apps.find((a) => a.id === t.appId)?.name ?? "" },
            { header: "Event", cell: (t) => t.event ?? "None" },
            { header: "Enabled", cell: (t) => <Badge variant={t.enabled ? "secondary" : "outline"}>{t.enabled ? "On" : "Off"}</Badge> },
            { header: "Updated", cell: (t) => <span className="text-xs tabular-nums">{formatWhen(t.updatedAt)}</span> },
          ]}
          rows={templates.rows}
          rowKey={(t) => t.id}
          empty="No templates yet"
        />
      </div>
    </>
  );
}

function NewTemplateForm({
  apps,
  appId,
  done,
}: {
  apps: { id: string; name: string }[];
  appId: string;
  done: () => void;
}) {
  const navigate = useNavigate();
  const [app, setApp] = useState(appId);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const template = await createTemplateFn({ data: { appId: app, input: { name } } });
      done();
      await navigate({ to: "/campaigns/templates/$templateId", params: { templateId: template.id }, search: { appId: app } });
    } catch (err) {
      setError(errorText(err, "Could not create this template."));
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="template-app">App</Label>
      <AppSelect apps={apps} value={app} onValueChange={setApp} id="template-app" />
      <Label htmlFor="template-name">Name</Label>
      <Input id="template-name" required value={name} onChange={(e) => setName(e.target.value)} />
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !name.trim() || !app}>
          Create
        </Button>
      </div>
    </form>
  );
}
