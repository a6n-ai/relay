"use client";

import { useState } from "react";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { AddMailboxForm } from "../../tenants/tenant-ops-forms";

type App = { publicId: string; name: string; domains: string[] };

/** Pick the app first; the address form then offers only that app's proven domains. */
export function AddMailboxPicker({ apps }: { apps: App[] }) {
  const [publicId, setPublicId] = useState(apps[0]?.publicId ?? "");
  const app = apps.find((a) => a.publicId === publicId);
  if (apps.length === 0) return <p className="text-sm text-muted-foreground">Add an app under Apps first.</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-xl flex-col gap-1">
        <Label htmlFor="mailbox-app">App</Label>
        <Select value={publicId} onValueChange={setPublicId}>
          <SelectTrigger id="mailbox-app">
            <SelectValue placeholder="Pick an app" />
          </SelectTrigger>
          <SelectContent>
            {apps.map((a) => (
              <SelectItem key={a.publicId} value={a.publicId}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {app ? <AddMailboxForm key={app.publicId} publicId={app.publicId} domains={app.domains} /> : null}
    </div>
  );
}
