"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@foundry/design-system";
import { Switch } from "@foundry/ui/switch";
import { Label } from "@foundry/ui/label";
import { apiFetch } from "./api-fetch";
import type { ContactListOption } from "./audience-builder";

/**
 * Resend a campaign that already went out. Server-side this creates a fresh
 * campaign (new dedupe namespace) that copies the original's content — see
 * retriggerCampaign in campaign-routes.ts for why a sent campaign can't just
 * be re-materialized in place.
 */
export function CampaignRetriggerButton({
  campaignPublicId,
  lists,
}: {
  campaignPublicId: string;
  lists: ContactListOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [wholeAudience, setWholeAudience] = useState(true);
  const [listId, setListId] = useState<string>(lists[0]?.publicId ?? "");
  const [sending, setSending] = useState(false);

  async function submit() {
    if (!wholeAudience && !listId) return toast.error("Pick a list");
    setSending(true);
    try {
      const res = await apiFetch<{ publicId: string; queued: number }>(
        `/api/notifications/campaigns/${campaignPublicId}/retrigger`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(wholeAudience ? {} : { listIds: [listId] }),
        },
      );
      toast.success(`Resending to ${res.queued} people`);
      setOpen(false);
      router.push(`/dashboard/notifications/campaigns/${res.publicId}`);
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Retrigger
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Retrigger this campaign"
        description="Sends a fresh copy now. This is a new send — anyone who already got it will get it again."
      >
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <Switch checked={wholeAudience} onCheckedChange={setWholeAudience} id="whole-audience" />
            <Label htmlFor="whole-audience">{wholeAudience ? "Whole original audience" : "One list only"}</Label>
          </div>
          {!wholeAudience && (
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={listId}
              onChange={(e) => setListId(e.target.value)}
            >
              {lists.map((l) => (
                <option key={l.publicId} value={l.publicId}>
                  {l.name} ({l.memberCount})
                </option>
              ))}
            </select>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={sending}>
              {sending ? "Sending…" : "Retrigger"}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
