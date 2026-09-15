"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircleIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@foundry/design-system";
import { apiFetch } from "./api-fetch";

/**
 * Manually close out a "sent" campaign as "completed" — nothing watches
 * outbox drain progress to flip this automatically, so an admin calls it once
 * results have settled. The route itself refuses anything but "sent".
 */
export function CampaignCompleteButton({ campaignPublicId }: { campaignPublicId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await apiFetch(`/api/notifications/campaigns/${campaignPublicId}/complete`, { method: "POST" });
      toast.success("Campaign marked completed");
      setOpen(false);
      router.refresh();
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CheckCircleIcon /> Mark completed
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Mark this campaign completed?"
        description="Closes it out as final. Results stay visible; this just records that nothing further is expected."
      >
        <div className="flex justify-end gap-2 p-4 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? "Marking…" : "Mark completed"}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}
