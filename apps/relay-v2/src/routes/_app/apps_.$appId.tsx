import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Switch } from "@foundry/ui/switch";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { KeyRoundIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { EmptyState } from "../../components/page/empty-state";
import { SettingsCard } from "../../components/page/settings-card";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { Toolbar } from "../../components/page/toolbar";
import { CellWhen, ResourceTable } from "../../components/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { SecretOnce } from "../../components/secret-once";
import { useCan } from "../../components/use-can";
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
import { formatDate, formatWhen } from "../../lib/format-date";

export const Route = createFileRoute("/_app/apps_/$appId")({
  pendingComponent: () => <TableSkeleton columns={5} />,
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
  const [keyOpen, setKeyOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  if (!data) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Apps", to: "/apps" }, { label: "App" }]} />
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
      <PageHeader crumbs={[{ label: "Apps", to: "/apps" }, { label: app.name }]} />
      <Toolbar>
        <Button variant="outline" size="sm" render={<Link to="/apps/$appId/webhooks" params={{ appId: app.id }} />}>
          Webhooks
        </Button>
        {canWrite ? (
          <CreateDialog trigger="Create key" title="New API key" open={keyOpen} onOpenChange={setKeyOpen}>
            {(done, lock) => <NewKeyForm appId={app.id} done={done} lock={lock} />}
          </CreateDialog>
        ) : null}
      </Toolbar>
      <div className="grid max-w-3xl gap-4 px-4 pb-8">
        <SettingsCard title="API keys" description="Keys let this app send through Relay.">
          <ResourceTable
            columns={[
              { header: "Name", cell: (k) => k.name ?? "Unnamed" },
              { header: "Prefix", cell: (k) => <span className="font-mono text-xs">{k.start ? `${k.start}…` : "—"}</span> },
              { header: "Status", cell: (k) => <Badge variant={k.enabled ? "secondary" : "outline"}>{k.enabled ? "Active" : "Revoked"}</Badge> },
              { header: "Created", cell: (k) => <CellWhen when={formatDate(k.createdAt)} text={formatWhen(k.createdAt)} /> },
              {
                header: "Last used",
                cell: (k) => (k.lastRequest ? <CellWhen when={formatDate(k.lastRequest)} text={formatWhen(k.lastRequest)} /> : "—"),
              },
            ]}
            rows={keys}
            rowKey={(k) => k.id}
            menu={canWrite ? (k) => [{ label: "Revoke", destructive: true, hidden: !k.enabled, onSelect: () => setRevokeId(k.id) }] : undefined}
            empty={
              <EmptyState
                icon={KeyRoundIcon}
                title="No keys yet"
                description="Create a key to start sending from this app."
                action={canWrite ? <Button size="sm" onClick={() => setKeyOpen(true)}>Create key</Button> : undefined}
              />
            }
          />
        </SettingsCard>
        <DefaultSendersPanel appId={app.id} senders={senders} canWrite={canWrite} />
        <AudiencePanel
          appId={app.id}
          hook={hook}
          canWrite={canWrite}
          bindWorkspaceId={shell.platformAdmin ? (shell.active?.id ?? null) : null}
        />
      </div>
      <ConfirmDialog
        open={revokeId !== null}
        onOpenChange={(o) => {
          if (!o) setRevokeId(null);
        }}
        title="Revoke this key?"
        description="Requests that use this key stop working right away."
        confirmLabel="Revoke key"
        onConfirm={() => {
          if (revokeId) void revoke(revokeId);
        }}
      />
    </>
  );
}

type DefaultSenders = NonNullable<Awaited<ReturnType<typeof fetchAppDetail>>>["senders"];

const NONE = "none";

// The loader returns no display name for the audience binding, so the one platform-admin button names it here.
const BINDING = "TIFFIN_AUDIENCE";
const BINDING_NAME = "TiffinGrab";

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
    <SettingsCard
      title="Default senders"
      description="Used when a send leaves out From. Tracked mail uses the transactional sender."
      action={
        canWrite ? (
          <Button type="submit" form="default-senders-form" size="sm" disabled={pending}>
            Save
          </Button>
        ) : undefined
      }
    >
      <form id="default-senders-form" onSubmit={save} className="grid gap-3">
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
      </form>
    </SettingsCard>
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

  async function connectBinding() {
    if (!bindWorkspaceId) return;
    try {
      await setAudienceBindingFn({ data: { workspaceId: bindWorkspaceId, appId, binding: BINDING } });
      toast.success("App audience connected");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not connect the App audience."));
    }
  }

  const editable = canWrite && hook && hook.kind !== "binding";
  const action =
    hook?.kind === "binding" ? undefined : (
      <div className="flex items-center gap-2">
        {editable ? (
          <ConfirmDialog
            trigger="Remove"
            title="Remove the App audience?"
            description="Campaigns that use it can't reach their audience until you connect one again."
            confirmLabel="Remove"
            onConfirm={remove}
          />
        ) : null}
        {bindWorkspaceId ? (
          <ConfirmDialog
            trigger={`Connect ${BINDING_NAME}`}
            title="Connect this audience?"
            description="Campaigns in this app will reach the connected app's customers. This replaces any Audience URL."
            confirmLabel="Connect"
            onConfirm={connectBinding}
          />
        ) : null}
        {canWrite ? (
          <Button type="submit" form="audience-form" size="sm" disabled={pending || !url.trim()}>
            Save
          </Button>
        ) : null}
      </div>
    );

  return (
    <SettingsCard
      title="App audience"
      description="Relay calls this URL for the people a campaign reaches. Campaigns pick it under Audience."
      action={action}
    >
      {hook?.kind === "binding" ? (
        <p className="text-sm">Connected by Relay</p>
      ) : (
        <form id="audience-form" onSubmit={save} className="grid gap-3">
          <Label htmlFor="audience-url">Audience URL</Label>
          <Input id="audience-url" type="url" required value={url} disabled={!canWrite} onChange={(e) => setUrl(e.target.value)} />
          <Label className="flex items-center gap-2 font-normal">
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canWrite} />
            Enabled
          </Label>
          {secret ? <SecretOnce secret={secret} label="Your App audience secret" onDone={() => setSecret(null)} /> : null}
          <FormError message={error} />
        </form>
      )}
    </SettingsCard>
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
