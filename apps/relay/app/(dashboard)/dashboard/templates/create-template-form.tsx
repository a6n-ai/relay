"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Textarea } from "@foundry/ui/textarea";
import { apiFetch } from "@relay/engine/ui/api-fetch";
import { CreateFooter, CreateTitleField, useCreateDialog } from "@/components/ds/create-dialog";

export function CreateTemplateForm({
  tenants,
}: {
  tenants: { publicId: string; name: string; slug: string }[];
}) {
  const { created } = useCreateDialog();
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
      created({ noun: "Template", name: event });
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
    <div className="flex flex-col gap-3">
      <div className="space-y-1">
        <CreateTitleField label="When this happens" placeholder="order.shipped" value={event} onChange={(e) => setEvent(e.target.value)} />
        <p className="text-xs text-muted-foreground">Use the same name your app uses when it asks Relay to send.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tpl-tenant">App</Label>
        <Select value={tenantPublicId} onValueChange={setTenantPublicId}>
          <SelectTrigger id="tpl-tenant" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tenants.map((t) => (
              <SelectItem key={t.publicId} value={t.publicId}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      <CreateFooter>
        <Button type="button" variant="outline" onClick={() => void sendTest()} disabled={busy}>Send test</Button>
        <Button type="button" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Create template"}</Button>
      </CreateFooter>
    </div>
  );
}
