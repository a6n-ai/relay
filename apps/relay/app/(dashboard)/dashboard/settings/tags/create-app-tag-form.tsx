"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { apiFetch } from "@relay/engine/ui";

export function CreateAppTagForm({
  apps,
}: {
  apps: { publicId: string; name: string }[];
}) {
  const router = useRouter();
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
      toast.success("Tag saved");
      setLabel("");
      router.refresh();
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
      <div className="space-y-1.5">
        <Label htmlFor="tag-label">Tag</Label>
        <Input
          id="tag-label"
          value={label}
          placeholder="VIP"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        />
      </div>
      <Button type="button" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Add tag"}
      </Button>
    </div>
  );
}
