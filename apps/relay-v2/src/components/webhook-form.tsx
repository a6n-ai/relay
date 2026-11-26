import { Checkbox } from "@foundry/ui/checkbox";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { updateWebhookFn } from "../console/webhooks.fns";
import type { WebhookEvent } from "../core/webhooks";
import { errorText } from "./error-text";
import { FormActions, FormBody, FormError } from "./page/form-parts";
import { Hint, SectionTitle } from "./page/text";
import { WEBHOOK_EVENT_LABELS, WEBHOOK_EVENT_LIST } from "./webhook-events";

export function WebhookUrlField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="webhook-url">URL</Label>
      <Input
        id="webhook-url"
        type="url"
        required
        autoFocus
        maxLength={2048}
        placeholder="https://example.com/webhooks/relay"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Hint size="xs">Use a public https:// URL.</Hint>
    </div>
  );
}

export function WebhookEventsField({ value, onChange }: { value: WebhookEvent[]; onChange: (events: WebhookEvent[]) => void }) {
  return (
    <fieldset className="grid gap-2">
      <SectionTitle as="legend">Events</SectionTitle>
      {WEBHOOK_EVENT_LIST.map((ev) => (
        <Label
          key={ev}
          className="items-start gap-3 rounded-(--ui-radius-control) border border-input p-3 font-normal has-data-checked:border-ring"
        >
          <Checkbox
            checked={value.includes(ev)}
            onCheckedChange={(on) => onChange(on ? [...value, ev] : value.filter((e) => e !== ev))}
          />
          {WEBHOOK_EVENT_LABELS[ev]}
        </Label>
      ))}
      {value.length === 0 ? <Hint size="xs">Pick at least one event.</Hint> : null}
    </fieldset>
  );
}

export function EditWebhookForm({
  appId,
  webhook,
  done,
}: {
  appId: string;
  webhook: { id: string; url: string; events: WebhookEvent[] };
  done: () => void;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(webhook.url);
  const [events, setEvents] = useState<WebhookEvent[]>(webhook.events);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const same = events.length === webhook.events.length && events.every((e) => webhook.events.includes(e));
  const dirty = url !== webhook.url || !same;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!dirty || events.length === 0) return;
    setPending(true);
    setError(null);
    try {
      await updateWebhookFn({
        data: { appId, id: webhook.id, ...(url !== webhook.url ? { url } : {}), ...(same ? {} : { events }) },
      });
      toast.success("Webhook updated");
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not update the webhook."));
    } finally {
      setPending(false);
    }
  }

  return (
    <FormBody onSubmit={submit}>
      <WebhookUrlField value={url} onChange={setUrl} />
      <WebhookEventsField value={events} onChange={setEvents} />
      <Hint size="xs">The signing secret stays the same.</Hint>
      <FormError message={error} />
      <FormActions cancel submitLabel="Save webhook" pending={pending} pendingLabel="Saving…" disabled={!dirty || events.length === 0} />
    </FormBody>
  );
}
