import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Switch } from "@foundry/ui/switch";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { ResourceTable } from "../../components/resource-table";
import { SecretOnce } from "../../components/secret-once";
import { useCan } from "../../components/use-can";
import { ViewHeader } from "../../components/view-header";
import {
  createKeyFn,
  deleteAudienceHookFn,
  fetchAppDetail,
  fetchAudienceHook,
  revokeKeyFn,
  setAppDefaultSendersFn,
  setAudienceHookFn,
} from "../../console/apps.fns";
import { setAudienceBindingFn } from "../../console/admin.fns";

export const Route = createFileRoute("/_app/apps_/$appId")({
  loader: async ({ params }) => {
    const data = await fetchAppDetail({ data: { appId: params.appId } });
    if (!data) return null;
    return { ...data, hook: await fetchAudienceHook({ data: { appId: params.appId } }) };
  },
  component: AppPage,
});

function AppPage() {
  const data = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const canWrite = useCan({ tenant: ["write"] });
  if (!data) {
    return (
      <>
        <ViewHeader title="App" />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const { app, keys, hook, senders } = data;

  async function revoke(id: string) {
    try {
      await revokeKeyFn({ data: { id } });
      toast.success("Key revoked");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not revoke the key"));
    }
  }

  return (
    <>
      <ViewHeader
        title={app.name}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" render={<Link to="/apps/$appId/webhooks" params={{ appId: app.id }} />}>
              Webhooks
            </Button>
            {canWrite ? (
              <CreateDialog trigger="Create key" title="New API key">
                {(done, lock) => <NewKeyForm appId={app.id} done={done} lock={lock} />}
              </CreateDialog>
            ) : null}
          </div>
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
              k.enabled && canWrite ? (
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
      <DefaultSendersPanel appId={app.id} senders={senders} canWrite={canWrite} />
      <AudiencePanel
        appId={app.id}
        hook={hook}
        canWrite={canWrite}
        bindWorkspaceId={shell.platformAdmin ? (shell.active?.id ?? null) : null}
      />
    </>
  );
}

type DefaultSenders = NonNullable<Awaited<ReturnType<typeof fetchAppDetail>>>["senders"];

const NONE = "none";

function DefaultSendersPanel({ appId, senders, canWrite }: { appId: string; senders: DefaultSenders; canWrite: boolean }) {
  const router = useRouter();
  const known = new Set(senders.options.map((o) => o.id));
  // A default whose address can no longer send is shown as None; saving then clears it.
  const [transactional, setTransactional] = useState(senders.transactionalId && known.has(senders.transactionalId) ? senders.transactionalId : NONE);
  const [marketing, setMarketing] = useState(senders.marketingId && known.has(senders.marketingId) ? senders.marketingId : NONE);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await setAppDefaultSendersFn({
        data: { appId, transactionalId: transactional === NONE ? null : transactional, marketingId: marketing === NONE ? null : marketing },
      });
      toast.success("Default senders saved");
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not save the default senders."));
    } finally {
      setPending(false);
    }
  }

  const choices = (
    <>
      <SelectItem value={NONE}>None</SelectItem>
      {senders.options.map((o) => (
        <SelectItem key={o.id} value={o.id}>
          {o.email}
        </SelectItem>
      ))}
    </>
  );

  return (
    <section className="grid max-w-2xl gap-3 p-4">
      <h2 className="text-sm font-medium">Default senders</h2>
      <p className="text-sm text-muted-foreground">Used when a send leaves out From. Tracked mail uses the transactional sender.</p>
      <form onSubmit={save} className="grid gap-3">
        <Label htmlFor="default-transactional">Transactional</Label>
        <Select value={transactional} onValueChange={(v) => setTransactional(v ?? NONE)} disabled={!canWrite}>
          <SelectTrigger id="default-transactional" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{choices}</SelectContent>
        </Select>
        <Label htmlFor="default-marketing">Marketing</Label>
        <Select value={marketing} onValueChange={(v) => setMarketing(v ?? NONE)} disabled={!canWrite}>
          <SelectTrigger id="default-marketing" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{choices}</SelectContent>
        </Select>
        <FormError message={error} />
        {canWrite ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </div>
        ) : null}
      </form>
    </section>
  );
}

type AudienceHook = Awaited<ReturnType<typeof fetchAudienceHook>>;

function AudiencePanel({
  appId,
  hook,
  canWrite,
  bindWorkspaceId,
}: {
  appId: string;
  hook: AudienceHook;
  canWrite: boolean;
  bindWorkspaceId: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(hook?.url ?? "");
  const [enabled, setEnabled] = useState(hook?.enabled ?? true);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await setAudienceHookFn({ data: { appId, url, enabled } });
      setSecret(result.secret);
      toast.success("App audience saved");
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not save the App audience."));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    try {
      await deleteAudienceHookFn({ data: { appId } });
      toast.success("App audience removed");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not remove the App audience."));
    }
  }

  async function connectTiffin() {
    if (!bindWorkspaceId) return;
    try {
      await setAudienceBindingFn({ data: { workspaceId: bindWorkspaceId, appId, binding: "TIFFIN_AUDIENCE" } });
      toast.success("App audience connected");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not connect the App audience."));
    }
  }

  return (
    <section className="grid max-w-2xl gap-3 p-4">
      <h2 className="text-sm font-medium">App audience</h2>
      <p className="text-sm text-muted-foreground">
        Relay calls this URL for the people a campaign reaches. Campaigns pick it under Audience.
      </p>
      {hook?.kind === "binding" ? (
        <p className="text-sm">Connected by Relay</p>
      ) : (
        <form onSubmit={save} className="grid gap-3">
          <Label htmlFor="audience-url">Audience URL</Label>
          <Input id="audience-url" type="url" required value={url} disabled={!canWrite} onChange={(e) => setUrl(e.target.value)} />
          <Label className="flex items-center gap-2 font-normal">
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canWrite} />
            Enabled
          </Label>
          {secret ? <SecretOnce secret={secret} label="Your App audience secret" onDone={() => setSecret(null)} /> : null}
          <FormError message={error} />
          {canWrite ? (
            <div className="flex justify-end">
              <Button type="submit" disabled={pending || !url.trim()}>
                Save
              </Button>
            </div>
          ) : null}
        </form>
      )}
      {bindWorkspaceId && hook?.kind !== "binding" ? (
        <div>
          <ConfirmDialog
            trigger="Connect TiffinGrab"
            title="Connect TiffinGrab's audience?"
            description="Campaigns in this app will reach TiffinGrab's customers. This replaces any Audience URL."
            confirmLabel="Connect"
            onConfirm={connectTiffin}
          />
        </div>
      ) : null}
      {canWrite && hook && hook.kind !== "binding" ? (
        <div>
          <ConfirmDialog
            trigger="Remove"
            title="Remove the App audience?"
            description="Campaigns that use it can't reach their audience until you connect one again."
            confirmLabel="Remove"
            onConfirm={remove}
          />
        </div>
      ) : null}
    </section>
  );
}

function NewKeyForm({ appId, done, lock }: { appId: string; done: () => void; lock: (locked: boolean) => void }) {
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
      lock(true);
      toast.success("Key created");
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not create the key."));
    } finally {
      setPending(false);
    }
  }

  if (created) return <SecretOnce secret={created} label="Your new API key" onDone={done} />;

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="key-name">Name</Label>
      <Input id="key-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          Create key
        </Button>
      </div>
    </form>
  );
}
