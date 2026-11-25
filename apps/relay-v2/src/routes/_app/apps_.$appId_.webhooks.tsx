import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Checkbox } from "@foundry/ui/checkbox";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { WebhookIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { EmptyState } from "../../components/page/empty-state";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { Toolbar } from "../../components/page/toolbar";
import { CellWhen, ResourceTable } from "../../components/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { runAction } from "../../components/run-action";
import { SecretOnce } from "../../components/secret-once";
import { useCan } from "../../components/use-can";
import { WEBHOOK_EVENT_LABELS, WEBHOOK_EVENT_LIST } from "../../components/webhook-events";
import { createWebhookFn, deleteWebhookFn, fetchWebhooks, updateWebhookFn } from "../../console/webhooks.fns";
import type { WebhookEvent } from "../../core/webhooks";
import { formatDate, formatWhen } from "../../lib/format-date";

export const Route = createFileRoute("/_app/apps_/$appId_/webhooks")({
  loader: ({ params }) => fetchWebhooks({ data: { appId: params.appId } }),
  pendingComponent: () => <TableSkeleton columns={4} />,
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
  const appName = shell.apps?.find((a) => a.id === appId)?.name ?? "App";
  const crumbs = [
    { label: "Apps", to: "/apps" },
    { label: appName, to: "/apps/$appId", params: { appId } },
    { label: "Webhooks" },
  ];
  if (!webhooks) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }

  return (
    <>
      <PageHeader crumbs={crumbs} />
      <Toolbar>
        {canWrite ? (
          <CreateDialog trigger="New webhook" title="New webhook" open={createOpen} onOpenChange={setCreateOpen}>
            {(done, lock) => <NewWebhookForm appId={appId} done={done} lock={lock} />}
          </CreateDialog>
        ) : null}
      </Toolbar>
      <ResourceTable
        columns={[
          { header: "URL", cell: (w) => <span className="break-all font-mono text-xs">{w.url}</span> },
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
          { label: "Deliveries", to: "/apps/$appId/webhooks/$webhookId", params: { appId, webhookId: w.id } },
          { label: "Delete", destructive: true, hidden: !canWrite, onSelect: () => setDeleteId(w.id) },
        ]}
        empty={
          <EmptyState
            icon={WebhookIcon}
            title="No webhooks yet"
            description="Relay calls your URL when mail is sent, delivered or received."
            action={canWrite ? <Button size="sm" onClick={() => setCreateOpen(true)}>New webhook</Button> : undefined}
          />
        }
      />
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
        title="Delete this webhook?"
        description="Messages stop being sent to this address right away. Deliveries still waiting are marked failed."
        confirmLabel="Delete webhook"
        onConfirm={() => {
          if (deleteId)
            void runAction(
              () => deleteWebhookFn({ data: { appId, id: deleteId } }),
              "Webhook deleted",
              () => router.invalidate(),
            );
        }}
      />
    </>
  );
}

function NewWebhookForm({ appId, done, lock }: { appId: string; done: () => void; lock: (locked: boolean) => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await createWebhookFn({ data: { appId, url, events } });
      setCreated(result.secret);
      lock(true);
      toast.success("Webhook created");
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not create the webhook."));
    } finally {
      setPending(false);
    }
  }

  if (created) return <SecretOnce secret={created} label="Signing secret" onDone={done} />;

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="webhook-url">URL</Label>
      <Input id="webhook-url" type="url" required maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} />
      <p className="text-xs text-muted-foreground">Must be a public https:// address</p>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Events</legend>
        {WEBHOOK_EVENT_LIST.map((ev) => (
          <label key={ev} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={events.includes(ev)}
              onCheckedChange={(on) => setEvents(on ? [...events, ev] : events.filter((e) => e !== ev))}
            />
            {WEBHOOK_EVENT_LABELS[ev]}
          </label>
        ))}
      </fieldset>
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || events.length === 0}>
          Create webhook
        </Button>
      </div>
    </form>
  );
}
