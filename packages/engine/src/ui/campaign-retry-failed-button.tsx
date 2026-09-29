"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcwIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@foundry/design-system";
import { apiFetch } from "./api-fetch";

/**
 * Re-send this campaign's failed messages. Delivery never retries on its own,
 * so a failed send stays failed until an admin asks for it here.
 */
export function CampaignRetryFailedButton({
  campaignPublicId,
  failedCount,
}: {
  campaignPublicId: string;
  failedCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const res = await apiFetch<{ requeued: number }>(
        `/api/notifications/campaigns/${campaignPublicId}/retry-failed`,
        { method: "POST" },
      );
      toast.success(res.requeued === 1 ? "1 message queued again" : `${res.requeued} messages queued again`);
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
        <RotateCcwIcon /> Retry {failedCount} failed
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={`Retry ${failedCount} failed ${failedCount === 1 ? "message" : "messages"}?`}
        description="Each one is sent once more. Recipients who already got this campaign are not mailed again."
      >
        <div className="flex justify-end gap-2 p-4 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? "Queuing…" : "Retry failed"}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}
