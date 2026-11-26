import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { KeyRoundIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ChoiceField, type ChoiceOption } from "../../components/form/choice-field";
import { FixedField } from "../../components/form/fixed-field";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { EmptyState } from "../../components/page/empty-state";
import { SettingsCard } from "../../components/page/settings-card";
import { FormSkeleton } from "../../components/page/page-skeleton";
import { Toolbar } from "../../components/page/toolbar";
import { CellWhen, ResourceTable } from "../../components/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { SecretOnce } from "../../components/secret-once";
import { useCan } from "../../components/use-can";
import {
  createKeyFn,
  renameKeyFn,
  updateAppFn,
  deleteAudienceHookFn,
  fetchAppDetail,
  fetchAudienceHook,
  revokeKeyFn,
  setAppDefaultSendersFn,
  setAudienceHookFn,
} from "../../console/apps.fns";
import { setAudienceBindingFn } from "../../console/admin.fns";
import { formatDate, formatWhen } from "../../lib/format-date";
import { FormError, FormBody, FormActions } from "../../components/page/form-parts";
import { UnsavedGuard } from "../../components/unsaved-guard";
import { RenameForm } from "../../components/form/rename-form";
import { Hint } from "../../components/page/text";

export const Route = createFileRoute("/_app/apps_/$appId")({
  pendingComponent: () => <FormSkeleton crumbs={[{ label: "Apps", to: "/apps" }, { label: "App" }]} cards={3} wide action />,
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
  const [renameId, setRenameId] = useState<string | null>(null);
  if (!data) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Apps", to: "/apps" }, { label: "App" }]} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const { app, keys, hook, senders } = data;
  const revoking = keys.find((k) => k.id === revokeId);
  const renaming = keys.find((k) => k.id === renameId);

  async function revoke(id: string) {
    await revokeKeyFn({ data: { id } });
    toast.success("Key revoked");
    await router.invalidate();
  }

  return (
    <>
      <PageHeader crumbs={[{ label: "Apps", to: "/apps" }, { label: app.name }]} />
      <Toolbar>
        <Button variant="outline" render={<Link to="/apps/$appId/webhooks" params={{ appId: app.id }} />}>
          Webhooks
        </Button>
        {canWrite ? (
          <CreateDialog trigger="Create key" title="New API key" open={keyOpen} onOpenChange={setKeyOpen}>
            {(done, lock) => <NewKeyForm appId={app.id} first={keys.length === 0} done={done} lock={lock} />}
          </CreateDialog>
        ) : null}
      </Toolbar>
      <div className="grid max-w-3xl gap-4 px-4 pb-8">
        <AppDetailsPanel appId={app.id} name={app.name} slug={app.slug} canWrite={canWrite} />
        <SettingsCard title="API keys" description="Keys let this app send through Relay.">
          <ResourceTable
            columns={[
              { header: "Name", cell: (k) => k.name ?? "Unnamed" },
              { header: "Prefix", kind: "mono", cell: (k) => k.start ? `${k.start}…` : "—" },
              { header: "Status", cell: (k) => <Badge variant={k.enabled ? "secondary" : "outline"}>{k.enabled ? "Active" : "Revoked"}</Badge> },
              { header: "Created", cell: (k) => <CellWhen when={formatDate(k.createdAt)} text={formatWhen(k.createdAt)} /> },
              {
                header: "Last used",
                cell: (k) => (k.lastRequest ? <CellWhen when={formatDate(k.lastRequest)} text={formatWhen(k.lastRequest)} /> : "—"),
              },
            ]}
            rows={keys}
            rowKey={(k) => k.id}
            menu={
              canWrite
                ? (k) => [
                    { label: "Rename", onSelect: () => setRenameId(k.id) },
                    { label: "Revoke", destructive: true, hidden: !k.enabled, onSelect: () => setRevokeId(k.id) },
                  ]
                : undefined
            }
            empty={
              <EmptyState
                icon={KeyRoundIcon}
                title="No keys yet"
                description="Create a key to start sending from this app."
                action={canWrite ? <Button variant="outline" onClick={() => setKeyOpen(true)}>Create key</Button> : undefined}
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
      <CreateDialog
        title="Rename key"
        open={renaming !== undefined}
        onOpenChange={(o) => {
          if (!o) setRenameId(null);
        }}
      >
        {(done) => (renaming ? <RenameForm key={renaming.id} id="key-rename" noun="Key" initial={renaming.name ?? ""} hint="Only the name changes. The key itself keeps working." save={(name) => renameKeyFn({ data: { id: renaming.id, name } })} done={done} /> : null)}
      </CreateDialog>
      <ConfirmDialog
        open={revokeId !== null}
        onOpenChange={(o) => {
          if (!o) setRevokeId(null);
        }}
        title={revoking ? `Revoke ${revoking.name ?? "this key"}${revoking.start ? ` (${revoking.start}…)` : ""}?` : "Revoke this key?"}
        description="Requests that use this key stop working right away."
        confirmLabel="Revoke key"
        onConfirm={async () => {
          if (revokeId) await revoke(revokeId);
        }}
      />
    </>
  );
}

function AppDetailsPanel({ appId, name, slug, canWrite }: { appId: string; name: string; slug: string; canWrite: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = value.trim() !== name;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty || !value.trim()) return;
    setPending(true);
    setError(null);
    try {
      await updateAppFn({ data: { id: appId, name: value.trim() } });
      toast.success("App renamed");
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not rename the app."));
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsCard
      title="Details"
      footer={dirty ? "Unsaved changes" : undefined}
      action={
        canWrite ? (
          <Button type="submit" variant="outline" form="app-details-form" disabled={pending || !dirty || !value.trim()}>
            {pending ? "Saving…" : "Save app"}
          </Button>
        ) : undefined
      }
    >
      <FormBody id="app-details-form" onSubmit={save}>
        <UnsavedGuard when={dirty} />
        <Label htmlFor="app-name">Name</Label>
        <Input id="app-name" required maxLength={80} value={value} disabled={!canWrite} onChange={(e) => setValue(e.target.value)} />
        <FixedField label="Slug" value={slug} hint="Create a new app to use a different slug." />
        <FormError message={error} />
      </FormBody>
    </SettingsCard>
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
  const only = senders.options.length === 1 ? senders.options[0].id : NONE;
  const savedTransactional = senders.transactionalId && known.has(senders.transactionalId) ? senders.transactionalId : NONE;
  const savedMarketing = senders.marketingId && known.has(senders.marketingId) ? senders.marketingId : NONE;
  const [transactional, setTransactional] = useState(savedTransactional === NONE ? only : savedTransactional);
  const [marketing, setMarketing] = useState(savedMarketing === NONE ? only : savedMarketing);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = transactional !== savedTransactional || marketing !== savedMarketing;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
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

  const choices: ChoiceOption[] = [{ value: NONE, label: "None" }, ...senders.options.map((o) => ({ value: o.id, label: o.email }))];

  return (
    <SettingsCard
      title="Default senders"
      description="Used when a send leaves out From. Tracked mail uses the transactional sender."
      footer={dirty ? "Unsaved changes" : undefined}
      action={
        canWrite && senders.options.length > 0 ? (
          <Button type="submit" variant="outline" form="default-senders-form" disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save senders"}
          </Button>
        ) : undefined
      }
    >
      {senders.options.length === 0 ? (
        <div className="grid gap-2">
          <Hint>Add a sender address first.</Hint>
          <div>
            <Button variant="outline" render={<Link to="/domains" search={{ new: undefined, q: undefined, status: undefined }} />}>
              Add address
            </Button>
          </div>
        </div>
      ) : (
        <FormBody id="default-senders-form" onSubmit={save}>
          <UnsavedGuard when={dirty} />
          {only !== NONE && savedTransactional === NONE && savedMarketing === NONE ? (
            <Hint size="xs">This app has one sender address, so it is selected for both. Save to keep it.</Hint>
          ) : null}
          <fieldset disabled={!canWrite} className="grid gap-3">
            <ChoiceField id="default-transactional" label="Transactional" value={transactional} onChange={setTransactional} options={choices} />
            <Hint size="xs">Receipts, password resets and other one-to-one mail.</Hint>
            <ChoiceField id="default-marketing" label="Marketing" value={marketing} onChange={setMarketing} options={choices} />
            <Hint size="xs">Campaigns and other mail sent to many people.</Hint>
          </fieldset>
          <FormError message={error} />
        </FormBody>
      )}
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
  const trimmed = url.trim();
  const urlInvalid = trimmed !== "" && !/^https:\/\/\S+$/i.test(trimmed);
  const dirty = url !== (hook?.url ?? "") || enabled !== (hook?.enabled ?? true);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty || !trimmed || urlInvalid) return;
    setPending(true);
    setError(null);
    try {
      const result = await setAudienceHookFn({ data: { appId, url: trimmed, enabled } });
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
    await deleteAudienceHookFn({ data: { appId } });
    toast.success("App audience removed");
    await router.invalidate();
  }

  // The server only generates a secret on first save, so a rotation sends a fresh one and shows it here.
  // url and enabled are required by the save, so they come from a fresh read, not the loader data.
  async function rotate() {
    const current = await fetchAudienceHook({ data: { appId } });
    if (!current?.url) throw new Error("Save the audience settings first.");
    const fresh = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
    await setAudienceHookFn({ data: { appId, url: current.url, secret: fresh, enabled: current.enabled } });
    setSecret(fresh);
    toast.success("Secret rotated");
    await router.invalidate();
  }

  async function connectBinding() {
    if (!bindWorkspaceId) return;
    await setAudienceBindingFn({ data: { workspaceId: bindWorkspaceId, appId, binding: BINDING } });
    toast.success("App audience connected");
    await router.invalidate();
  }

  const editable = canWrite && hook && hook.kind !== "binding";
  const action =
    hook?.kind === "binding" ? undefined : (
      <div className="flex items-center gap-2">
        {editable ? (
          <ConfirmDialog
            trigger="Remove"
            title={`Remove the App audience${hook?.url ? ` for ${hostOf(hook.url)}` : ""}?`}
            description="Campaigns that use it can't reach their audience until you connect one again."
            confirmLabel="Remove audience"
            onConfirm={remove}
          />
        ) : null}
        {editable && hook?.kind === "https" ? (
          <ConfirmDialog
            trigger="Rotate secret"
            title={`Rotate the secret for ${hostOf(hook.url ?? "")}?`}
            description="The current secret stops working right away. Update your server with the new one."
            confirmLabel="Rotate secret"
            onConfirm={rotate}
          />
        ) : null}
        {bindWorkspaceId ? (
          <ConfirmDialog
            trigger={`Connect ${BINDING_NAME}`}
            title="Connect this audience?"
            description="Campaigns in this app will reach the connected app's customers. This replaces any Audience URL."
            confirmLabel="Connect audience"
            destructive={false}
            onConfirm={connectBinding}
          />
        ) : null}
        {canWrite ? (
          <Button type="submit" variant="outline" form="audience-form" disabled={pending || !dirty || !trimmed || urlInvalid}>
            {pending ? "Saving…" : "Save audience"}
          </Button>
        ) : null}
      </div>
    );

  return (
    <SettingsCard
      title="App audience"
      description="Relay calls this URL for the people a campaign reaches. Campaigns pick it under Audience."
      footer={dirty ? "Unsaved changes" : undefined}
      action={action}
    >
      {hook?.kind === "binding" ? (
        <p className="text-sm">Connected by Relay</p>
      ) : (
        <FormBody id="audience-form" onSubmit={save}>
          <UnsavedGuard when={dirty} />
          <Label htmlFor="audience-url">Audience URL</Label>
          <Input
            id="audience-url"
            type="url"
            required
            placeholder="https://example.com/relay/audience"
            aria-invalid={urlInvalid || undefined}
            value={url}
            disabled={!canWrite}
            onChange={(e) => setUrl(e.target.value)}
          />
          {urlInvalid ? <FormError message="Must be a public https:// URL." /> : null}
          <Label className="font-normal">
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canWrite} />
            Enabled
          </Label>
          {secret ? <SecretOnce secret={secret} label="Your App audience secret" onDone={() => setSecret(null)} /> : null}
          <FormError message={error} />
        </FormBody>
      )}
    </SettingsCard>
  );
}

function NewKeyForm({ appId, first, done, lock }: { appId: string; first: boolean; done: () => void; lock: (locked: boolean) => void }) {
  const router = useRouter();
  const [name, setName] = useState(first ? "Production" : "");
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
    <FormBody onSubmit={submit}>
      <Label htmlFor="key-name">Name</Label>
      <Input
        id="key-name"
        required
        autoFocus
        maxLength={80}
        placeholder="Production"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Hint size="xs">Pick a name you will recognise later, such as Production or Staging.</Hint>
      <FormError message={error} />
      <FormActions cancel submitLabel="Create key" pending={pending} pendingLabel="Creating…" />
    </FormBody>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
