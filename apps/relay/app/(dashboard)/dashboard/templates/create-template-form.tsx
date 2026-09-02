"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { apiFetch } from "@relay/engine/ui";

export function CreateTemplateForm({
  tenants,
}: {
  tenants: { publicId: string; name: string; slug: string }[];
}) {
  const router = useRouter();
  const [tenantPublicId, setTenantPublicId] = useState(tenants[0]?.publicId ?? "");
  const [event, setEvent] = useState("order.shipped");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("<p>{{title}}</p>");
  const [text, setText] = useState("{{title}}");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!tenantPublicId) return toast.error("Pick an app");
    setBusy(true);
    try {
      await apiFetch("/api/notifications/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantPublicId,
          event,
          channel: "email",
          locale: "en",
          subject,
          html,
          text,
          body: text,
        }),
      });
      toast.success("Template saved");
      router.refresh();
    } catch {
      /* toasted */
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      await apiFetch("/api/notifications/templates/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, html, text }),
      });
      toast.success("Test queued to your email");
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
        <Label htmlFor="tpl-tenant">App</Label>
        <select
          id="tpl-tenant"
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
        <Label htmlFor="tpl-event">When this happens</Label>
        <Input id="tpl-event" value={event} onChange={(e) => setEvent(e.target.value)} />
        <p className="text-xs text-muted-foreground">Use the same name your app uses when it asks Relay to send.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tpl-subject">Subject</Label>
        <Input id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tpl-html">Email (formatted)</Label>
        <Textarea id="tpl-html" rows={6} value={html} onChange={(e) => setHtml(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tpl-text">Plain text</Label>
        <Textarea id="tpl-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="outline" onClick={() => void sendTest()} disabled={busy}>Send test</Button>
      </div>
    </div>
  );
}
