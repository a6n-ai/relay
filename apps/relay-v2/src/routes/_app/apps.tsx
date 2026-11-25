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
import { FormError } from "../../components/form-error";
import { EmptyState } from "../../components/page/empty-state";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { ResourceTable } from "../../components/resource-table";
import { useNewParam } from "../../components/shell/create-menu";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { createAppFn, fetchApps } from "../../console/apps.fns";

export const Route = createFileRoute("/_app/apps")({
  validateSearch: (search: Record<string, unknown>): { new?: 1 } => ({
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
  }),
  loader: () => fetchApps(),
  pendingComponent: () => <TableSkeleton columns={3} />,
  component: AppsPage,
});

function AppsPage() {
  const apps = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const canWrite = useCan({ tenant: ["write"] });
  const [open, setOpen] = useNewParam();
  const [query, setQuery] = useState("");
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
  return (
    <>
      <PageHeader crumbs={crumbs} />
      <Toolbar search={apps.length > 0 ? <SearchInput value={query} onChange={setQuery} placeholder="Search apps" /> : undefined}>
        {create}
      </Toolbar>
      <ResourceTable
        columns={[
          { header: "Name", cell: (a) => <span className="font-medium">{a.name}</span> },
          { header: "Slug", cell: (a) => <span className="font-mono text-xs">{a.slug}</span> },
          { header: "Live keys", numeric: true, cell: (a) => a.keyCount },
        ]}
        rows={rows}
        rowKey={(a) => a.id}
        rowHref={(a) => ({ to: "/apps/$appId", params: { appId: a.id } })}
        rowLabel={(a) => `Open ${a.name}`}
        menu={(a) => [
          { label: "Open", to: "/apps/$appId", params: { appId: a.id } },
          { label: "Webhooks", to: "/apps/$appId/webhooks", params: { appId: a.id } },
        ]}
        empty={
          apps.length === 0 ? (
            <EmptyState
              icon={BoxesIcon}
              title="No apps yet"
              description="An app gets its own API keys and senders."
              action={canWrite ? <Button size="sm" onClick={() => setOpen(true)}>New app</Button> : undefined}
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No apps match your search.</p>
          )
        }
      />
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

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="app-name">Name</Label>
      <Input id="app-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <Label htmlFor="app-slug">Slug</Label>
      <Input
        id="app-slug"
        required
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        aria-describedby="app-slug-hint"
      />
      <p id="app-slug-hint" className="text-xs text-muted-foreground">
        Lowercase letters, numbers and hyphens.
      </p>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          Create app
        </Button>
      </div>
    </form>
  );
}
