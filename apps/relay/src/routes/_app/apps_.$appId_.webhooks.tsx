import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Switch } from "@foundry/ui/switch";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { WebhookIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/page/confirm-dialog";
import { CreateDialog } from "../../components/page/create-dialog";
import { PageDenied } from "../../components/page/page-denied";
import { EmptyState } from "../../components/page/empty-state";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { CellWhen, ResourceTable } from "../../components/page/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { confirmAction, runAction } from "../../components/lib/run-action";
import { SecretOnce } from "../../components/page/secret-once";
import { useCan } from "../../components/lib/use-can";
import { WEBHOOK_EVENT_LABELS, WEBHOOK_EVENT_LIST } from "../../components/webhooks/webhook-events";
import { EditWebhookForm, WebhookEventsField, WebhookUrlField } from "../../components/webhooks/webhook-form";
import { createWebhookFn, deleteWebhookFn, fetchWebhooks, updateWebhookFn } from "../../console/webhooks.fns";
import { formatDate, formatWhen } from "../../components/lib/format-date";
import { FormError, FormBody, FormActions } from "../../components/form/form-parts";
import { type WebhookEvent } from "../../shared/mail";
import { hostOf } from "../../components/lib/path";
import { appName } from "../../shared/scope";
import { useSubmit } from "../../components/lib/use-submit";
import type { Crumb } from "../../components/shell/page-header";

const DESCRIPTION = "Where Relay tells your app about message events.";

export const Route = createFileRoute("/_app/apps_/$appId_/webhooks")({
  loader: ({ params }) => fetchWebhooks({ data: { appId: params.appId } }),
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Apps", to: "/apps" }, { label: "Webhooks" }]} columns={4} action />,
  component: WebhooksPage,
});

function WebhooksPage() {
  const webhooks = Route.useLoaderData();
  const { appId } = Route.useParams();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const canWrite = useCan({ webhook: ["write"] });
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const appLabel = appName(shell.apps, appId, "App");
  const crumbs: Crumb[] = [
    { label: "Apps", to: "/apps" },
    { label: appLabel, to: "/apps/$appId", params: { appId } },
    { label: "Webhooks" },
  ];
  const editing = webhooks?.find((w) => w.id === editId);
  const deleting = webhooks?.find((w) => w.id === deleteId);
  if (!webhooks) {
    return <PageDenied crumbs={crumbs} description={DESCRIPTION} />;
  }

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        description={DESCRIPTION}
        actions={
          canWrite ? (
            <CreateDialog trigger="New webhook" title="New webhook" open={createOpen} onOpenChange={setCreateOpen}>
              {(done, lock) => <NewWebhookForm appId={appId} done={done} lock={lock} />}
            </CreateDialog>
          ) : null
        }
      />
      <ResourceTable
        columns={[
          { header: "URL", kind: "url", cell: (w) => w.url },
          { header: "Events", cell: (w) => w.events.map((e) => WEBHOOK_EVENT_LABELS[e]).join(", ") || "—" },
          {
            header: "Enabled",
            cell: (w) =>
              canWrite ? (
                <Switch
                  checked={w.enabled}
                  onCheckedChange={(on) =>
                    runAction(
                      () => updateWebhookFn({ data: { appId, id: w.id, enabled: on } }),
                      on ? "Webhook turned on" : "Webhook turned off",
                      () => router.invalidate(),
                    )
                  }
                  aria-label={`Enabled for ${w.url}`}
                />
              ) : (
                <Badge variant={w.enabled ? "secondary" : "outline"}>{w.enabled ? "On" : "Off"}</Badge>
              ),
          },
          { header: "Created", cell: (w) => <CellWhen when={formatDate(w.createdAt)} text={formatWhen(w.createdAt)} /> },
        ]}
        rows={webhooks}
        rowKey={(w) => w.id}
        rowHref={(w) => ({ to: "/apps/$appId/webhooks/$webhookId", params: { appId, webhookId: w.id } })}
        rowLabel={() => "Open deliveries"}
        menu={(w) => [
          { label: "Edit webhook", hidden: !canWrite, onSelect: () => setEditId(w.id) },
          { label: "View deliveries", to: "/apps/$appId/webhooks/$webhookId", params: { appId, webhookId: w.id } },
          { label: "Delete webhook", destructive: true, hidden: !canWrite, onSelect: () => setDeleteId(w.id) },
        ]}
        empty={
          <EmptyState
            icon={WebhookIcon}
            title="No webhooks yet"
            description="Relay calls your URL when mail is received."
            action={canWrite ? <Button variant="outline" onClick={() => setCreateOpen(true)}>New webhook</Button> : undefined}
          />
        }
      />
      <CreateDialog
        title="Edit webhook"
        open={editing !== undefined}
        onOpenChange={(o) => {
          if (!o) setEditId(null);
        }}
      >
        {(done) => (editing ? <EditWebhookForm key={editing.id} appId={appId} webhook={editing} done={done} /> : null)}
      </CreateDialog>
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title={deleting ? `Delete webhook for ${hostOf(deleting.url)}?` : "Delete this webhook?"}
        description="Relay stops calling this URL right away. Deliveries still waiting are marked failed."
        confirmLabel="Delete webhook"
        onConfirm={async () => {
          if (deleteId) await confirmAction(() => deleteWebhookFn({ data: { appId, id: deleteId } }), "Webhook deleted", () => router.invalidate());
        }}
      />
    </>
  );
}


function NewWebhookForm({ appId, done, lock }: { appId: string; done: () => void; lock: (locked: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>(WEBHOOK_EVENT_LIST);
  const [created, setCreated] = useState<string | null>(null);
  const { pending, error, run } = useSubmit();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (events.length === 0) return;
    await run(async () => {
      const result = await createWebhookFn({ data: { appId, url, events } });
      setCreated(result.secret);
      lock(true);
    }, "Could not create the webhook.", { success: "Webhook created" });
  }

  if (created) return <SecretOnce secret={created} label="Signing secret" onDone={done} />;

  return (
    <FormBody onSubmit={submit}>
      <WebhookUrlField value={url} onChange={setUrl} />
      <WebhookEventsField value={events} onChange={setEvents} />
      <FormError message={error} />
      <FormActions cancel submitLabel="Create webhook" pending={pending} pendingLabel="Creating…" disabled={events.length === 0} disabledReason="Pick at least one event." />
    </FormBody>
  );
}
