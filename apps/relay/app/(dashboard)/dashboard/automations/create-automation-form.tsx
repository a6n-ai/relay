"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LoadingButton } from "@/components/interior/loading-button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { apiFetch } from "@relay/engine/ui/api-fetch";
import { CreateFooter, CreateTitleField, useCreateDialog } from "@/components/ds/create-dialog";

export function CreateAutomationForm({
  tenants,
  lists,
}: {
  tenants: { publicId: string; name: string; slug: string }[];
  lists: { publicId: string; name: string }[];
}) {
  const { created } = useCreateDialog();
  const [tenantPublicId, setTenantPublicId] = useState(tenants[0]?.publicId ?? "");
  const [listPublicId, setListPublicId] = useState(lists[0]?.publicId ?? "");
  const [name, setName] = useState("Add signups to list");
  const [triggerEvent, setTriggerEvent] = useState("user.signup");

  // Returns false when nothing was saved, so the button can show it failed.
  async function save(): Promise<boolean> {
    if (!tenantPublicId || !listPublicId) { toast.error("Pick an app and a group of people"); return false; }
    try {
      await apiFetch("/api/notifications/automations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantPublicId, listPublicId, name, triggerEvent }),
      });
      created({ noun: "Automation", name });
      return true;
    } catch {
      return false; // apiFetch already toasted
    }
  }

  if (tenants.length === 0 || lists.length === 0) {
    return <p className="text-sm text-muted-foreground">Need at least one app and one group of people.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <CreateTitleField label="Name" placeholder="Automation name" value={name} onChange={(e) => setName(e.target.value)} />
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
      <CreateFooter>
        <LoadingButton onAction={async () => { if (!(await save())) throw new Error("not saved"); }} pendingLabel="Saving…" successLabel="Saved">Create automation</LoadingButton>
      </CreateFooter>
    </div>
  );
}
