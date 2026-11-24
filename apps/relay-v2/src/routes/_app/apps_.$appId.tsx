import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { ResourceTable } from "../../components/resource-table";
import { SecretOnce } from "../../components/secret-once";
import { ViewHeader } from "../../components/view-header";
import { createKeyFn, fetchAppDetail, revokeKeyFn } from "../../console/apps.fns";

export const Route = createFileRoute("/_app/apps_/$appId")({
  loader: ({ params }) => fetchAppDetail({ data: { appId: params.appId } }),
  component: AppPage,
});

function AppPage() {
  const { app, keys } = Route.useLoaderData();
  const router = useRouter();

  async function revoke(id: string) {
    try {
      await revokeKeyFn({ data: { id } });
      toast.success("Key revoked");
      await router.invalidate();
    } catch {
      toast.error("Could not revoke the key");
    }
  }

  return (
    <>
      <ViewHeader
        title={app.name}
        actions={
          <CreateDialog trigger="Create key" title="New API key">
            {(done) => <NewKeyForm appId={app.id} done={done} />}
          </CreateDialog>
        }
      />
      <ResourceTable
        columns={[
          { header: "Name", cell: (k) => k.name ?? "Unnamed" },
          { header: "Key", cell: (k) => <span className="font-mono text-xs">{k.start ? `${k.start}…` : "-"}</span> },
          { header: "Status", cell: (k) => <Badge variant={k.enabled ? "secondary" : "outline"}>{k.enabled ? "Active" : "Revoked"}</Badge> },
          { header: "Created", cell: (k) => new Date(k.createdAt).toLocaleDateString("en-CA") },
          { header: "Last used", cell: (k) => (k.lastRequest ? new Date(k.lastRequest).toLocaleDateString("en-CA") : "Never") },
          {
            header: "",
            cell: (k) =>
              k.enabled ? (
                <ConfirmDialog
                  trigger="Revoke"
                  title="Revoke this key?"
                  description="Requests that use this key stop working right away."
                  confirmLabel="Revoke key"
                  onConfirm={() => revoke(k.id)}
                />
              ) : null,
          },
        ]}
        rows={keys}
        rowKey={(k) => k.id}
        empty="No keys yet. Create one to start sending from this app."
      />
    </>
  );
}

function NewKeyForm({ appId, done }: { appId: string; done: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const key = await createKeyFn({ data: { appId, name } });
      setCreated(key.secret);
      toast.success("Key created");
      await router.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the key.");
    } finally {
      setPending(false);
    }
  }

  if (created) return <SecretOnce secret={created} label="Your new API key" onDone={done} />;

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="key-name">Name</Label>
      <Input id="key-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          Create key
        </Button>
      </div>
    </form>
  );
}
