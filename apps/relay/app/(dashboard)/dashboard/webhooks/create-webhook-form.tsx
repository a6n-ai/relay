"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LoadingButton } from "@/components/interior/loading-button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { apiFetch } from "@relay/engine/ui/api-fetch";
import { CreateFooter, useCreateDialog } from "@/components/ds/create-dialog";
import { webhookEventLabel } from "@/components/ds/plain-labels";

const EVENTS = [
  "message.queued",
  "message.sent",
  "message.failed",
  "message.bounced",
  "message.complained",
] as const;

/** The address's host reads better in a toast than the whole URL. */
function destinationName(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function CreateWebhookForm({
  tenants,
}: {
  tenants: { publicId: string; name: string; slug: string }[];
}) {
  const { created } = useCreateDialog();
  const [tenantPublicId, setTenantPublicId] = useState(tenants[0]?.publicId ?? "");
  const [url, setUrl] = useState("https://yourapp.com/webhooks/relay");
  const [events, setEvents] = useState<string[]>(["message.sent", "message.failed"]);

  function toggle(ev: string) {
    setEvents((cur) => (cur.includes(ev) ? cur.filter((x) => x !== ev) : [...cur, ev]));
  }

  // Returns false when nothing was saved, so the button can show it failed.
  async function save(): Promise<boolean> {
    if (!tenantPublicId) { toast.error("Pick an app"); return false; }
    if (events.length === 0) { toast.error("Pick at least one update"); return false; }
    try {
      const res = await apiFetch<{ secret: string }>("/api/notifications/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantPublicId, url, events }),
      });
      created({ noun: "Destination", name: destinationName(url), secret: res.secret });
      return true;
    } catch {
      return false; // apiFetch already toasted
    }
  }

  if (tenants.length === 0) {
    return <p className="text-sm text-muted-foreground">Add an app first.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="wh-tenant">App</Label>
        <select
          id="wh-tenant"
          className="border-input bg-background h-9 w-full border px-3 text-sm"
          value={tenantPublicId}
          onChange={(e) => setTenantPublicId(e.target.value)}
        >
          {tenants.map((t) => (
            <option key={t.publicId} value={t.publicId}>{t.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="wh-url">Where to send updates</Label>
        <Input id="wh-url" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Tell me when</legend>
        {EVENTS.map((ev) => (
          <label key={ev} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={events.includes(ev)} onChange={() => toggle(ev)} />
            {webhookEventLabel(ev)}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted-foreground">
        We’ll include a signature so the other system can trust the update. You’ll see the signing secret once, after you save.
      </p>
      <CreateFooter>
        <LoadingButton onAction={async () => { if (!(await save())) throw new Error("not saved"); }} pendingLabel="Saving…" successLabel="Saved">Create destination</LoadingButton>
      </CreateFooter>
    </div>
  );
}
