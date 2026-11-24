import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { CreateDialog } from "../../components/create-dialog";
import { ResourceTable } from "../../components/resource-table";
import { ViewHeader } from "../../components/view-header";
import { createAppFn, fetchApps } from "../../console/apps.fns";

export const Route = createFileRoute("/_app/apps")({
  loader: () => fetchApps(),
  component: AppsPage,
});

function AppsPage() {
  const apps = Route.useLoaderData();
  return (
    <>
      <ViewHeader
        title="Apps"
        actions={<CreateDialog trigger="New app" title="New app">{(done) => <NewAppForm done={done} />}</CreateDialog>}
      />
      <ResourceTable
        columns={[
          {
            header: "Name",
            cell: (a) => (
              <Link to="/apps/$appId" params={{ appId: a.id }} className="font-medium hover:underline">
                {a.name}
              </Link>
            ),
          },
          { header: "Slug", cell: (a) => <span className="font-mono text-xs">{a.slug}</span> },
          { header: "Live keys", cell: (a) => <span className="tabular-nums">{a.keyCount}</span> },
        ]}
        rows={apps}
        rowKey={(a) => a.id}
        empty="No apps yet. Create one to get an API key."
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
      setError(err instanceof Error ? err.message : "Could not create the app.");
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
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          Create app
        </Button>
      </div>
    </form>
  );
}
