import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Checkbox } from "@foundry/ui/checkbox";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
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
import { runAction } from "../../components/run-action";
import { SecretOnce } from "../../components/secret-once";
import { useCan } from "../../components/use-can";
import { ViewHeader } from "../../components/view-header";
import { WEBHOOK_EVENT_LABELS, WEBHOOK_EVENT_LIST } from "../../components/webhook-events";
import { createWebhookFn, deleteWebhookFn, fetchWebhooks, updateWebhookFn } from "../../console/webhooks.fns";
import type { WebhookEvent } from "../../core/webhooks";

export const Route = createFileRoute("/_app/apps_/$appId_/webhooks")({
  loader: ({ params }) => fetchWebhooks({ data: { appId: params.appId } }),
  component: WebhooksPage,
});

function WebhooksPage() {
  const webhooks = Route.useLoaderData();
  const { appId } = Route.useParams();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const canWrite = useCan({ webhook: ["write"] });
  if (!webhooks) {
    return (
      <>
        <ViewHeader title="Webhooks" />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }

  return (
    <>
      <ViewHeader
        title="Webhooks"
        actions={
          canWrite ? (
            <CreateDialog trigger="New webhook" title="New webhook">
              {(done, lock) => <NewWebhookForm appId={appId} done={done} lock={lock} />}
            </CreateDialog>
          ) : undefined
        }
      />
      <ResourceTable
        columns={[
          { header: "URL", cell: (w) => <span className="break-all font-mono text-xs">{w.url}</span> },
          { header: "Events", cell: (w) => w.events.map((e) => WEBHOOK_EVENT_LABELS[e]).join(", ") },
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
          { header: "Created", cell: (w) => new Date(w.createdAt).toLocaleDateString("en-CA") },
          {
            header: "",
            cell: (w) => (
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" render={<Link to="/apps/$appId/webhooks/$webhookId" params={{ appId, webhookId: w.id }} />}>
                  Deliveries
                </Button>
                {canWrite ? (
                  <ConfirmDialog
                    trigger="Delete"
                    title="Delete this webhook?"
                    description="Letters stop being sent to this address right away. Deliveries still waiting are marked failed."
                    confirmLabel="Delete webhook"
                    onConfirm={() =>
                      runAction(
                        () => deleteWebhookFn({ data: { appId, id: w.id } }),
                        "Webhook deleted",
                        () => router.invalidate(),
                      )
                    }
                  />
                ) : null}
              </div>
            ),
          },
        ]}
        rows={webhooks}
        rowKey={(w) => w.id}
        empty="No webhooks yet. Add one to get a copy of each new letter at your own address."
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
