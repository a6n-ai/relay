"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { SettingsFooter, SettingsRow } from "@/components/ds/settings";
import { updateClientLimitsAction } from "./actions";

export function ClientLimitsForm({
  organizationId,
  name,
  monthlyMessageQuota,
  maxApps,
}: {
  organizationId: string;
  name: string;
  monthlyMessageQuota: number;
  maxApps: number;
}) {
  const [pending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState(name);
  const [quota, setQuota] = useState(monthlyMessageQuota);
  const [apps, setApps] = useState(maxApps);

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("organizationId", organizationId);
      fd.set("name", displayName);
      fd.set("monthlyMessageQuota", String(quota));
      fd.set("maxApps", String(apps));
      const result = await updateClientLimitsAction(fd);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Client limits saved");
    });
  }

  return (
    <>
      <SettingsRow label="Name" description="Shown in the Clients list and workspace switcher.">
        <Input
          className="w-48"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={pending}
        />
      </SettingsRow>
      <SettingsRow
        label="Monthly sends"
        description="Cap across every app in this workspace. 0 = unlimited."
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="client-quota" className="sr-only">
            Monthly sends
          </Label>
          <Input
            id="client-quota"
            className="w-32"
            type="number"
            min={0}
            value={quota}
            onChange={(e) => setQuota(Number(e.target.value))}
            disabled={pending}
          />
        </div>
      </SettingsRow>
      <SettingsRow label="Max apps" description="How many apps this client may create. 0 = unlimited.">
        <div className="flex flex-col gap-1">
          <Label htmlFor="client-max-apps" className="sr-only">
            Max apps
          </Label>
          <Input
            id="client-max-apps"
            className="w-32"
            type="number"
            min={0}
            value={apps}
            onChange={(e) => setApps(Number(e.target.value))}
            disabled={pending}
          />
        </div>
      </SettingsRow>
      <SettingsFooter>
        <Button type="button" size="sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save limits"}
        </Button>
      </SettingsFooter>
    </>
  );
}
