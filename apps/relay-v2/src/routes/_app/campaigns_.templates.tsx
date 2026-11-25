import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import FileTextIcon from "lucide-react/icons/file-text";
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
import { ResourceTable } from "../../components/resource-table";
import { useNewParam } from "../../components/shell/create-menu";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { fetchApps } from "../../console/apps.fns";
import { createTemplateFn, fetchTemplates } from "../../console/templates.fns";
import { formatWhen } from "../../lib/format-date";

type TemplatesSearch = { appId?: string; cursor?: string; new?: 1 };

export const Route = createFileRoute("/_app/campaigns_/templates")({
  validateSearch: (search: Record<string, unknown>): TemplatesSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
    cursor: typeof search.cursor === "string" && search.cursor ? search.cursor : undefined,
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId, cursor: search.cursor }),
  pendingComponent: () => <TableSkeleton columns={5} />,
  loader: async ({ deps }) => {
    const apps = await fetchApps();
    if (!apps) return null;
    const appId = deps.appId ?? apps[0]?.id;
    if (!appId) return { apps, appId, templates: { rows: [], nextCursor: null } };
    const templates = await fetchTemplates({ data: { appId, cursor: deps.cursor } }).catch((err) => {
      if (isNotFound(err)) return { missing: true as const };
      throw err;
    });
    if (!templates) return null;
    return "missing" in templates ? templates : { apps, appId, templates };
  },
  component: TemplatesPage,
});

const CRUMBS = [{ label: "Campaigns", to: "/campaigns" }, { label: "Templates" }];

function TemplatesPage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const search = Route.useSearch();
  const canWrite = useCan({ template: ["write"] });
  const [open, setOpen] = useNewParam();
  const [query, setQuery] = useState("");
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
  const { apps, appId, templates } = page;
  const canCreate = canWrite && Boolean(appId);
  const newButton = canCreate ? <Button size="sm" onClick={() => setOpen(true)}>New template</Button> : null;
  const q = query.trim().toLowerCase();
  const rows = templates.rows.filter((t) => !q || t.name.toLowerCase().includes(q));
  return (
    <>
      <PageHeader crumbs={CRUMBS} />
      <Toolbar search={<SearchInput value={query} onChange={setQuery} placeholder="Search templates" />}>{newButton}</Toolbar>
      {canCreate && appId ? (
        <CreateDialog title="New template" open={open} onOpenChange={setOpen}>
          {(done) => <NewTemplateForm apps={apps} appId={appId} done={done} />}
        </CreateDialog>
      ) : null}
      <ResourceTable
        columns={[
          { header: "Name", cell: (t) => <span className="font-medium">{t.name}</span> },
          ...(search.appId ? [] : [{ header: "App", cell: (t: (typeof rows)[number]) => apps.find((a) => a.id === t.appId)?.name ?? "—" }]),
          { header: "Event", cell: (t) => t.event ?? "—" },
          { header: "Enabled", cell: (t) => <Badge variant={t.enabled ? "secondary" : "outline"}>{t.enabled ? "On" : "Off"}</Badge> },
          { header: "Updated", cell: (t) => <span className="tabular-nums">{formatWhen(t.updatedAt)}</span> },
        ]}
        rows={rows}
        rowKey={(t) => t.id}
        rowHref={(t) => ({ to: "/campaigns/templates/$templateId", params: { templateId: t.id }, search: { appId: t.appId } })}
        rowLabel={(t) => `Open ${t.name}`}
        menu={(t) => [{ label: "Open", to: "/campaigns/templates/$templateId", params: { templateId: t.id }, search: { appId: t.appId } }]}
        empty={
          templates.rows.length === 0 ? (
            <EmptyState
              icon={FileTextIcon}
              title="No templates yet."
              description="Templates are reusable email content."
              action={newButton}
            />
          ) : (
            "No templates match."
          )
        }
      />
      <LoadMore
        hasMore={Boolean(templates.nextCursor)}
        to="/campaigns/templates"
        search={{ appId: search.appId, cursor: templates.nextCursor }}
        resetTo={search.cursor ? "/campaigns/templates" : undefined}
      />
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
