"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { apiFetch } from "@relay/engine/ui";

export function CreateAutomationForm({
  tenants,
  lists,
}: {
  tenants: { publicId: string; name: string; slug: string }[];
  lists: { publicId: string; name: string }[];
}) {
  const router = useRouter();
  const [tenantPublicId, setTenantPublicId] = useState(tenants[0]?.publicId ?? "");
  const [listPublicId, setListPublicId] = useState(lists[0]?.publicId ?? "");
  const [name, setName] = useState("Add signups to list");
  const [triggerEvent, setTriggerEvent] = useState("user.signup");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!tenantPublicId || !listPublicId) return toast.error("Pick an app and a group of people");
    setBusy(true);
    try {
      await apiFetch("/api/notifications/automations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantPublicId, listPublicId, name, triggerEvent }),
      });
      toast.success("Automation saved");
      router.refresh();
    } catch {
      /* toasted */
    } finally {
      setBusy(false);
    }
  }

  if (tenants.length === 0 || lists.length === 0) {
    return <p className="text-sm text-muted-foreground">Need at least one app and one group of people.</p>;
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="au-name">Name</Label>
        <Input id="au-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="au-event">When this happens</Label>
        <Input id="au-event" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="au-tenant">App</Label>
        <select
          id="au-tenant"
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
        <Label htmlFor="au-list">Add them to</Label>
        <select
          id="au-list"
          className="border-input bg-background h-9 w-full border px-3 text-sm"
          value={listPublicId}
          onChange={(e) => setListPublicId(e.target.value)}
        >
          {lists.map((l) => (
            <option key={l.publicId} value={l.publicId}>{l.name}</option>
          ))}
        </select>
      </div>
      <Button type="button" onClick={() => void save()} disabled={busy}>Save automation</Button>
    </div>
  );
}
