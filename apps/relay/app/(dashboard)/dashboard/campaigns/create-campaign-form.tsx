"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { apiFetch } from "@relay/engine/ui";

export function CreateCampaignForm({
  tenants,
  lists,
}: {
  tenants: { publicId: string; name: string; slug: string }[];
  lists: { publicId: string; name: string; memberCount: number }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [tenantPublicId, setTenantPublicId] = useState(tenants[0]?.publicId ?? "");
  const [listIds, setListIds] = useState<string[]>(lists[0] ? [lists[0].publicId] : []);
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");
  const [channels, setChannels] = useState<string[]>(["email"]);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("<p>Hello {{contact.name}}</p>");
  const [text, setText] = useState("Hello {{contact.name}}");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast.error("Name the campaign");
    if (!tenantPublicId) return toast.error("Pick an app — From address and footer come from that app");
    if (listIds.length === 0) return toast.error("Pick at least one group of people");
    if (!subject.trim()) return toast.error("Add a subject");
    setSaving(true);
    try {
      const created = await apiFetch<{ publicId: string }>("/api/notifications/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          tenantPublicId,
          channels,
          audience: { listIds },
          scheduledAt: scheduledAtLocal ? new Date(scheduledAtLocal).getTime() : null,
        }),
      });
      for (const channel of channels) {
        await apiFetch(`/api/notifications/campaigns/${created.publicId}/content`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            channel === "email"
              ? { channel, locale: "en", subject, html, text, body: text }
              : { channel, locale: "en", subject, body: text },
          ),
        });
      }
      toast.success(scheduledAtLocal ? "Scheduled" : "Draft saved");
      router.push(`/dashboard/campaigns/${created.publicId}`);
      router.refresh();
    } catch {
      /* apiFetch toasted */
    } finally {
      setSaving(false);
    }
  }

  if (tenants.length === 0) {
    return <p className="text-sm text-muted-foreground">Add an app before you can send a campaign.</p>;
  }
  if (lists.length === 0) {
    return <p className="text-sm text-muted-foreground">Import people first.</p>;
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="cmp-name">Name</Label>
        <Input id="cmp-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cmp-tenant">Send as</Label>
        <select
          id="cmp-tenant"
          className="border-input bg-background h-9 w-full border px-3 text-sm"
          value={tenantPublicId}
          onChange={(e) => setTenantPublicId(e.target.value)}
        >
          {tenants.map((t) => (
            <option key={t.publicId} value={t.publicId}>
              {t.name} ({t.slug})
            </option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">People</legend>
        {lists.map((l) => (
          <label key={l.publicId} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={listIds.includes(l.publicId)}
              onChange={() =>
                setListIds((cur) =>
                  cur.includes(l.publicId) ? cur.filter((id) => id !== l.publicId) : [...cur, l.publicId],
                )
              }
            />
            {l.name} ({l.memberCount})
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">How to reach them</legend>
        {(["email", "sms", "whatsapp"] as const).map((ch) => (
          <label key={ch} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={channels.includes(ch)}
              onChange={() =>
                setChannels((cur) => (cur.includes(ch) ? cur.filter((c) => c !== ch) : [...cur, ch]))
              }
            />
            {ch === "email" ? "Email" : ch === "sms" ? "Text" : "WhatsApp"}
          </label>
        ))}
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="cmp-when">Send at (optional)</Label>
        <Input
          id="cmp-when"
          type="datetime-local"
          value={scheduledAtLocal}
          onChange={(e) => setScheduledAtLocal(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Leave empty to save as a draft. Set a time to send later.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cmp-subject">Subject</Label>
        <Input id="cmp-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cmp-html">Email (formatted)</Label>
        <Textarea id="cmp-html" rows={6} value={html} onChange={(e) => setHtml(e.target.value)} />
        <p className="text-xs text-muted-foreground">You can insert a person’s name with {"{{contact.name}}"}.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cmp-text">Plain text</Label>
        <Textarea id="cmp-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <Button type="button" onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save draft"}
      </Button>
    </div>
  );
}
