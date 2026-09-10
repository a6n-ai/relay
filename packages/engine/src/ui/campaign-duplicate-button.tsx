"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@foundry/design-system";
import { apiFetch } from "./api-fetch";
import { AudienceBuilder, type AudienceValue, type ContactListOption } from "./audience-builder";

/** Clone a campaign's content/channels into a new draft, optionally onto a different audience. */
export function CampaignDuplicateButton({
  campaignPublicId,
  lists,
  timeZone,
}: {
  campaignPublicId: string;
  lists: ContactListOption[];
  timeZone: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [changeAudience, setChangeAudience] = useState(false);
  const [audience, setAudience] = useState<AudienceValue>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await apiFetch<{ publicId: string }>(
        `/api/notifications/campaigns/${campaignPublicId}/duplicate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(changeAudience ? { audience } : {}),
        },
      );
      toast.success("Duplicated as a new draft");
      setOpen(false);
      router.push(`/dashboard/notifications/campaigns/${res.publicId}`);
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Duplicate
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Duplicate this campaign"
        description="Creates a new draft with the same content. Edit and send it separately."
      >
        <div className="space-y-4 p-4">
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
