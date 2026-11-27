import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { KeyRoundIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { confirmAction } from "../../components/lib/run-action";
import { ChoiceField, type ChoiceOption } from "../../components/form/choice-field";
import { NameField } from "../../components/form/text-field";
import { FixedField } from "../../components/form/fixed-field";
import { ConfirmDialog } from "../../components/page/confirm-dialog";
import { CreateDialog } from "../../components/page/create-dialog";
import { PageDenied } from "../../components/page/page-denied";
import { EmptyState } from "../../components/page/empty-state";
import { SettingsCard, SettingsForm } from "../../components/page/settings-card";
import { FormSkeleton } from "../../components/page/page-skeleton";
import { CellWhen, ResourceTable } from "../../components/page/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { SecretOnce } from "../../components/page/secret-once";
import { useCan } from "../../components/lib/use-can";
import {
  createKeyFn,
  deleteKeyFn,
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
import { formatDate, formatWhen } from "../../components/lib/format-date";
import { FormError, FormBody, FormActions, FormPanel } from "../../components/form/form-parts";
import { RenameForm } from "../../components/form/rename-form";
import { Hint } from "../../components/form/text";
import { hostOf } from "../../components/lib/path";
import { useSubmit } from "../../components/lib/use-submit";
import { AUDIENCE_BINDINGS } from "../../shared/audience";

export const Route = createFileRoute("/_app/apps_/$appId")({
  pendingComponent: () => <FormSkeleton crumbs={[{ label: "Apps", to: "/apps" }, { label: "App" }]} cards={3} action />,
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
  const [deleteId, setDeleteId] = useState<string | null>(null);
  if (!data) {
    return <PageDenied crumbs={[{ label: "Apps", to: "/apps" }, { label: "App" }]} />;
  }
  const { app, keys, hook, senders } = data;
  const revoking = keys.find((k) => k.id === revokeId);
  const renaming = keys.find((k) => k.id === renameId);
  const deleting = keys.find((k) => k.id === deleteId);

  async function revoke(id: string) {
    await confirmAction(() => revokeKeyFn({ data: { id } }), "Key revoked", () => router.invalidate());
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Apps", to: "/apps" }, { label: app.name }]}
        description="Details and API keys for this app."
        actions={
          canWrite ? (
            <CreateDialog trigger="New key" title="New API key" open={keyOpen} onOpenChange={setKeyOpen}>
              {(done, lock) => <NewKeyForm appId={app.id} first={keys.length === 0} done={done} lock={lock} />}
            </CreateDialog>
          ) : null
        }
      />
      <FormPanel>
        <AppDetailsPanel appId={app.id} name={app.name} slug={app.slug} canWrite={canWrite} />
        <SettingsCard title="API keys" description="Keys let this app send through Relay.">
          <ResourceTable
            columns={[
              { header: "Name", cell: (k) => k.name ?? "Unnamed" },
              { header: "Prefix", secondary: true, kind: "mono", cell: (k) => k.start ? `${k.start}…` : "—" },
              { header: "Status", cell: (k) => <Badge variant={k.enabled ? "secondary" : "outline"}>{k.enabled ? "Active" : "Revoked"}</Badge> },
              { header: "Created", secondary: true, cell: (k) => <CellWhen when={formatDate(k.createdAt)} text={formatWhen(k.createdAt)} /> },
              {
                header: "Last used", secondary: true,
                cell: (k) => (k.lastRequest ? <CellWhen when={formatDate(k.lastRequest)} text={formatWhen(k.lastRequest)} /> : "—"),
              },
            ]}
            rows={keys}
            rowKey={(k) => k.id}
            menu={
              canWrite
                ? (k) => [
                    { label: "Rename key", onSelect: () => setRenameId(k.id) },
                    { label: "Revoke key", destructive: true, hidden: !k.enabled, onSelect: () => setRevokeId(k.id) },
                    { label: "Delete key", destructive: true, onSelect: () => setDeleteId(k.id) },
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
      </FormPanel>
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
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title={deleting ? `Delete ${deleting.name ?? "this key"}${deleting.start ? ` (${deleting.start}…)` : ""}?` : "Delete this key?"}
        description={deleting?.enabled ? "Requests that use this key stop working right away. You can't restore it or use it again. Messages it sent stay." : "The key leaves this list for good. You can't restore it or use it again. Messages it sent stay."}
        confirmLabel="Delete key"
        onConfirm={async () => {
          if (!deleteId) return;
          await confirmAction(() => deleteKeyFn({ data: { id: deleteId } }), "Key deleted", () => router.invalidate());
        }}
      />
    </>
  );
}

function AppDetailsPanel({ appId, name, slug, canWrite }: { appId: string; name: string; slug: string; canWrite: boolean }) {
  const [value, setValue] = useState(name);
  const { pending, error, run } = useSubmit();
  const dirty = value.trim() !== name;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty || !value.trim()) return;
    await run(async () => {
      await updateAppFn({ data: { id: appId, name: value.trim() } });
    }, "Could not rename the app.", { success: "App renamed" });
  }

  return (
    <SettingsForm
      title="Details"
      dirty={dirty}
      pending={pending}
      saveLabel="Save app"
      canWrite={canWrite}
      invalidReason={!value.trim() ? "Enter a name first." : undefined}
      onSubmit={save}
    >
      <NameField id="app-name" value={value} disabled={!canWrite} onChange={(e) => setValue(e.target.value)} />
      <FixedField label="Short name" value={slug} hint="Create a new app to use a different short name." />
      <FormError message={error} />
    </SettingsForm>
  );
}

type DefaultSenders = NonNullable<Awaited<ReturnType<typeof fetchAppDetail>>>["senders"];

const NONE = "none";

// The loader returns no display name for the audience binding, so the one platform-admin button names it here.
const BINDING = AUDIENCE_BINDINGS[0];
const BINDING_NAME = "TiffinGrab";

function DefaultSendersPanel({ appId, senders, canWrite }: { appId: string; senders: DefaultSenders; canWrite: boolean }) {
  const known = new Set(senders.options.map((o) => o.id));
  // A default whose address can no longer send is shown as None; saving then clears it.
  const only = senders.options.length === 1 ? senders.options[0].id : NONE;
  const savedTransactional = senders.transactionalId && known.has(senders.transactionalId) ? senders.transactionalId : NONE;
  const savedMarketing = senders.marketingId && known.has(senders.marketingId) ? senders.marketingId : NONE;
  const [transactional, setTransactional] = useState(savedTransactional === NONE ? only : savedTransactional);
  const [marketing, setMarketing] = useState(savedMarketing === NONE ? only : savedMarketing);
  const { pending, error, run } = useSubmit();
  const dirty = transactional !== savedTransactional || marketing !== savedMarketing;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    await run(async () => {
      await setAppDefaultSendersFn({
        data: { appId, transactionalId: transactional === NONE ? null : transactional, marketingId: marketing === NONE ? null : marketing },
      });
    }, "Could not save the default senders.", { success: "Default senders saved" });
  }

  const choices: ChoiceOption[] = [{ value: NONE, label: "None" }, ...senders.options.map((o) => ({ value: o.id, label: o.email }))];

  return (
    <SettingsForm
      title="Default senders"
      description="Used when a send leaves out From. Tracked mail uses the transactional sender."
      dirty={dirty}
      pending={pending}
      saveLabel="Save senders"
      canWrite={canWrite && senders.options.length > 0}
      onSubmit={save}
    >
      {senders.options.length === 0 ? (
        <div className="grid gap-2">
          <Hint>Add a sender address first.</Hint>
          <div>
            <Button variant="outline" render={<Link to="/domains/addresses/new" search={{ appId }} />}>
              Add address
            </Button>
          </div>
        </div>
      ) : (
        <>
          {only !== NONE && savedTransactional === NONE && savedMarketing === NONE ? (
            <Hint size="xs">This app has one sender address, so it is selected for both. Save to keep it.</Hint>
          ) : null}
          <fieldset disabled={!canWrite} className="grid gap-3">
            <ChoiceField id="default-transactional" label="Transactional" hint="Receipts, password resets and other one-to-one mail." value={transactional} onChange={setTransactional} options={choices} />
            <ChoiceField id="default-marketing" label="Marketing" hint="Campaigns and other mail sent to many people." value={marketing} onChange={setMarketing} options={choices} />
          </fieldset>
          <FormError message={error} />
        </>
      )}
    </SettingsForm>
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
  const { pending, error, run } = useSubmit();
  const trimmed = url.trim();
  const urlInvalid = trimmed !== "" && !/^https:\/\/\S+$/i.test(trimmed);
  const dirty = url !== (hook?.url ?? "") || enabled !== (hook?.enabled ?? true);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!dirty || !trimmed || urlInvalid) return;
    await run(async () => {
      const result = await setAudienceHookFn({ data: { appId, url: trimmed, enabled } });
      setSecret(result.secret);
    }, "Could not save the App audience.", { success: "App audience saved" });
  }

  async function remove() {
    await confirmAction(() => deleteAudienceHookFn({ data: { appId } }), "App audience removed", () => router.invalidate());
  }

  // The server only generates a secret on first save, so a rotation sends a fresh one and shows it here.
  // url and enabled are required by the save, so they come from a fresh read, not the loader data.
  async function rotate() {
    await confirmAction(
      async () => {
        const current = await fetchAudienceHook({ data: { appId } });
        if (!current?.url) throw new Error("audience not saved");
        const fresh = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
        await setAudienceHookFn({ data: { appId, url: current.url, secret: fresh, enabled: current.enabled } });
        setSecret(fresh);
      },
      "Secret rotated",
      () => router.invalidate(),
    );
  }

  async function connectBinding() {
    if (!bindWorkspaceId) return;
    await confirmAction(() => setAudienceBindingFn({ data: { workspaceId: bindWorkspaceId, appId, binding: BINDING } }), "App audience connected", () => router.invalidate());
  }

  const editable = canWrite && hook && hook.kind !== "binding";
  const extraActions =
    hook?.kind === "binding" ? undefined : (
      <>
        {editable ? (
          <ConfirmDialog
            trigger="Remove audience"
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
            description="The current secret stops working right away. The new secret is shown once, so update your server with it."
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
      </>
    );

  return (
    <SettingsForm
      title="App audience"
      description="Relay calls this URL for the people a campaign reaches. Campaigns pick it under Audience."
      dirty={dirty}
      pending={pending}
      saveLabel="Save audience"
      canWrite={canWrite && hook?.kind !== "binding"}
      invalidReason={!trimmed ? "Enter the audience URL first." : urlInvalid ? "Use a public https:// URL." : undefined}
      onSubmit={save}
      extraActions={extraActions}
    >
      {hook?.kind === "binding" ? (
        <p className="text-sm">Connected by Relay</p>
      ) : (
        <>
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
        </>
      )}
    </SettingsForm>
  );
}

function NewKeyForm({ appId, first, done, lock }: { appId: string; first: boolean; done: () => void; lock: (locked: boolean) => void }) {
  const [name, setName] = useState(first ? "Production" : "");
  const [created, setCreated] = useState<string | null>(null);
  const { pending, error, run } = useSubmit();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const key = await createKeyFn({ data: { appId, name } });
      setCreated(key.secret);
      lock(true);
    }, "Could not create the key.", { success: "Key created" });
  }

  if (created) return <SecretOnce secret={created} label="Your new API key" onDone={done} />;

  return (
    <FormBody onSubmit={submit}>
      <NameField
        id="key-name"
        hint="Production, Staging or the service that uses it."
        autoFocus
        placeholder="Production"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <FormError message={error} />
      <FormActions cancel submitLabel="Create key" pending={pending} pendingLabel="Creating…" disabled={!name.trim()} disabledReason="Enter a name first." />
    </FormBody>
  );
}
