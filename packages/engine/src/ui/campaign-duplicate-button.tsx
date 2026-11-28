"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@foundry/ui/toast";
import { CopyIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { ResponsiveDialog } from "@foundry/design-system";
import { apiAction, apiFetch } from "@foundry/ui/api-fetch";
import { AudienceBuilder, type AudienceValue, type ContactListOption } from "./audience-builder";

export function CampaignDuplicateButton({
  campaignPublicId,
  campaignName,
  lists,
  timeZone,
  compact,
}: {
  campaignPublicId: string;
  campaignName: string;
  lists: ContactListOption[];
  timeZone: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const defaultName = `${campaignName} (copy)`;
  const [name, setName] = useState(defaultName);
  const [changeAudience, setChangeAudience] = useState(false);
  const [audience, setAudience] = useState<AudienceValue>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return toast.error("Name the new campaign");
    setSaving(true);
    const res = await apiAction(
      apiFetch<{ publicId: string }>(`/api/notifications/campaigns/${campaignPublicId}/duplicate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), ...(changeAudience ? { audience } : {}) }),
      }),
    );
    setSaving(false);
    if (!res) return;
    toast.success("Duplicated as a new draft");
    setOpen(false);
    router.push(`/dashboard/notifications/campaigns/${res.data.publicId}`);
  }

  return (
    <>
      {compact ? (
        <Button variant="ghost" size="icon" aria-label="Duplicate" title="Duplicate" onClick={() => setOpen(true)}>
          <CopyIcon className="size-4" />
        </Button>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Duplicate
        </Button>
      )}
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Duplicate this campaign"
        description="Creates a new draft with the same content. Edit and send it separately."
      >
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="duplicate-campaign-name">Name</Label>
            <Input id="duplicate-campaign-name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={changeAudience}
              onChange={(e) => setChangeAudience(e.target.checked)}
            />
            Send the copy to a different audience
          </label>
          {changeAudience && (
            <AudienceBuilder
              lists={lists}
              value={audience}
              onChange={setAudience}
              requiresVerifiedPhone={false}
              timeZone={timeZone}
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Duplicating…" : "Duplicate"}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
