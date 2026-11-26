import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { BoxesIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { EmptyState } from "../../components/page/empty-state";
import { ResourceGrid } from "../../components/page/resource-grid";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { ViewToggle } from "../../components/page/view-toggle";
import { type View, viewPref } from "../../components/page/view-pref";
import { SlugField } from "../../components/form/slug-field";
import { splitSlugError } from "../../components/form/slugify";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { ResourceTable } from "../../components/resource-table";
import { useNewParam } from "../../components/shell/create-menu";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { createAppFn, fetchApps } from "../../console/apps.fns";
import { FormError, FormBody, FormActions } from "../../components/page/form-parts";

export const Route = createFileRoute("/_app/apps")({
  validateSearch: (search: Record<string, unknown>): { new?: 1; q?: string } => ({
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  loader: () => fetchApps(),
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Apps" }]} columns={3} search view action />,
  component: AppsPage,
});

function AppsPage() {
  const apps = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const canWrite = useCan({ tenant: ["write"] });
  const [open, setOpen] = useNewParam();
  const [query, setQuery] = useUrlFilter("q");
  const [view, setView] = useState<View>(() => viewPref.read(Route.fullPath));
  const crumbs = [{ label: "Apps" }];
  if (!apps) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const q = query.trim().toLowerCase();
  const rows = q ? apps.filter((a) => a.name.toLowerCase().includes(q)) : apps;
  const create = canWrite ? (
    <CreateDialog trigger="New app" title="New app" open={open} onOpenChange={setOpen}>
      {(done) => <NewAppForm done={done} />}
    </CreateDialog>
  ) : undefined;
  const menu = (a: (typeof apps)[number]) => [
    { label: "Open", to: "/apps/$appId", params: { appId: a.id } },
    { label: "Webhooks", to: "/apps/$appId/webhooks", params: { appId: a.id } },
  ];
  const empty =
    apps.length === 0 ? (
      <EmptyState
        icon={BoxesIcon}
        title="No apps yet"
        description="An app gets its own API keys and senders."
        action={canWrite ? <Button variant="outline" onClick={() => setOpen(true)}>New app</Button> : undefined}
      />
    ) : (
      <p className="p-4 text-sm text-muted-foreground">No apps match your search.</p>
    );
  return (
    <>
      <PageHeader crumbs={crumbs} />
      <Toolbar
        search={apps.length > 0 ? <SearchInput value={query} onChange={setQuery} placeholder="Search apps" /> : undefined}
        view={apps.length > 0 ? <ViewToggle route={Route.fullPath} value={view} onChange={setView} /> : undefined}
      >
        {create}
      </Toolbar>
      {view === "grid" ? (
        <ResourceGrid
          items={rows}
          rowKey={(a) => a.id}
          href={(a) => ({ to: "/apps/$appId", params: { appId: a.id } })}
          rowLabel={(a) => `Open ${a.name}`}
          menu={menu}
          card={(a) => (
            <div className="grid gap-1 pr-8">
              <p className="truncate text-sm font-medium">{a.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{a.slug}</p>
              <p className="text-xs text-muted-foreground">
                {a.keyCount} live {a.keyCount === 1 ? "key" : "keys"}
              </p>
            </div>
          )}
          empty={empty}
        />
      ) : (
        <ResourceTable
          columns={[
            { header: "Name", kind: "name", cell: (a) => a.name },
            { header: "Slug", kind: "mono", cell: (a) => a.slug },
            { header: "Live keys", numeric: true, cell: (a) => a.keyCount },
          ]}
          rows={rows}
          rowKey={(a) => a.id}
          rowHref={(a) => ({ to: "/apps/$appId", params: { appId: a.id } })}
          rowLabel={(a) => `Open ${a.name}`}
          menu={menu}
          empty={empty}
        />
      )}
    </>
  );
}

function NewAppForm({ done }: { done: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await createAppFn({ data: { name, slug } });
      toast.success("App created", { description: name });
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not create the app."));
    } finally {
      setPending(false);
    }
  }

  const split = splitSlugError(error);
  return (
    <FormBody onSubmit={submit}>
      <Label htmlFor="app-name">Name</Label>
      <Input
        id="app-name"
        required
        autoFocus
        maxLength={80}
        placeholder="Acme Production"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <SlugField id="app-slug" name={name} value={slug} onChange={setSlug} error={split.slug} />
      <FormError message={split.rest} />
      <FormActions cancel submitLabel="Create app" pending={pending} pendingLabel="Creating…" />
    </FormBody>
  );
}
