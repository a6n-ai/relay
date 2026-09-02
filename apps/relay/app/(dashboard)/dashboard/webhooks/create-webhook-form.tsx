"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { apiFetch } from "@relay/engine/ui";
import { webhookEventLabel } from "@/components/ds/plain-labels";

const EVENTS = [
  "message.queued",
  "message.sent",
  "message.failed",
  "message.bounced",
  "message.complained",
] as const;

export function CreateWebhookForm({
  tenants,
}: {
  tenants: { publicId: string; name: string; slug: string }[];
}) {
  const router = useRouter();
  const [tenantPublicId, setTenantPublicId] = useState(tenants[0]?.publicId ?? "");
  const [url, setUrl] = useState("https://example.com/webhooks/relay");
  const [events, setEvents] = useState<string[]>(["message.sent", "message.failed"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(ev: string) {
    setEvents((cur) => (cur.includes(ev) ? cur.filter((x) => x !== ev) : [...cur, ev]));
  }

  async function save() {
    if (!tenantPublicId) return toast.error("Pick an app");
    if (events.length === 0) return toast.error("Pick at least one update");
    setBusy(true);
    try {
      const res = await apiFetch<{ secret: string }>("/api/notifications/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantPublicId, url, events }),
      });
      setSecret(res.secret);
      toast.success("Saved — copy the secret now");
      router.refresh();
    } catch {
      /* toasted */
    } finally {
      setBusy(false);
    }
  }

  if (tenants.length === 0) {
    return <p className="text-sm text-muted-foreground">Add an app first.</p>;
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="wh-tenant">App</Label>
        <select
          id="wh-tenant"
          className="border-input bg-background h-9 w-full border px-3 text-sm"
          value={tenantPublicId}
          onChange={(e) => setTenantPublicId(e.target.value)}
        >
          {tenants.map((t) => (
            <option key={t.publicId} value={t.publicId}>{t.name} ({t.slug})</option>
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
      <Button type="button" onClick={() => void save()} disabled={busy}>Save destination</Button>
      {secret ? (
        <p className="text-sm">
          Signing secret (shown once): <code className="break-all">{secret}</code>
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        We’ll include a signature so the other system can trust the update.
      </p>
    </div>
  );
}
