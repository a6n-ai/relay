"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { apiFetch } from "@relay/engine/ui/api-fetch";
import { CreateFooter, CreateTitleField, useCreateDialog } from "@/components/ds/create-dialog";

export function CreateAppTagForm({
  apps,
}: {
  apps: { publicId: string; name: string }[];
}) {
  const { created } = useCreateDialog();
  const [tenantPublicId, setTenantPublicId] = useState(apps[0]?.publicId ?? "");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!tenantPublicId) return toast.error("Pick an app");
    if (!label.trim()) return toast.error("Add a tag name");
    setBusy(true);
    try {
      await apiFetch("/api/notifications/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantPublicId, label: label.trim() }),
      });
      created({ noun: "Tag", name: label });
    } catch {
      /* toasted */
    } finally {
      setBusy(false);
    }
  }

  if (apps.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Add an app first. Tags apply to every message that app sends or receives.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1.5">
        <CreateTitleField
          label="Tag"
          value={label}
          placeholder="Tag name, like VIP"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tag-app">App</Label>
        <select
          id="tag-app"
          className="border-input bg-background h-9 w-full border px-3 text-sm"
          value={tenantPublicId}
          onChange={(e) => setTenantPublicId(e.target.value)}
        >
          {apps.map((a) => (
            <option key={a.publicId} value={a.publicId}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <CreateFooter>
        <Button type="button" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Create tag"}
        </Button>
      </CreateFooter>
    </div>
  );
}
