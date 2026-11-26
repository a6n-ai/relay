import { Checkbox } from "@foundry/ui/checkbox";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { updateWebhookFn } from "../console/webhooks.fns";
import type { WebhookEvent } from "../core/webhooks";
import { errorText } from "./error-text";
import { TextField } from "./form/text-field";
import { FormActions, FormBody, FormError } from "./page/form-parts";
import { Hint, SectionTitle } from "./page/text";
import { WEBHOOK_EVENT_LABELS, WEBHOOK_EVENT_LIST } from "./webhook-events";

export function WebhookUrlField({ value, onChange, hint = "Use a public https:// URL." }: { value: string; onChange: (url: string) => void; hint?: string }) {
  return (
    <TextField
      id="webhook-url"
      label="URL"
      hint={hint}
      type="url"
      required
      autoFocus
      maxLength={2048}
      placeholder="https://example.com/webhooks/relay"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function WebhookEventsField({ value, onChange }: { value: WebhookEvent[]; onChange: (events: WebhookEvent[]) => void }) {
  // One event cannot be unticked, so it is stated instead of offered as a choice.
  if (WEBHOOK_EVENT_LIST.length < 2) return <Hint>Calls your URL when a letter arrives.</Hint>;
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
      <WebhookUrlField value={url} onChange={setUrl} hint="The signing secret stays the same." />
      <WebhookEventsField value={events} onChange={setEvents} />
      <FormError message={error} />
      <FormActions cancel submitLabel="Save webhook" pending={pending} pendingLabel="Saving…" disabled={!dirty || events.length === 0} disabledReason={events.length === 0 ? "Pick at least one event." : "Change something to save."} />
    </FormBody>
  );
}
