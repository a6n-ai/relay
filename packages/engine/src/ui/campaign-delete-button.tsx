"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@foundry/design-system";
import { apiFetch } from "./api-fetch";

/**
 * Delete a draft/scheduled campaign that never sent. The route itself refuses
 * anything past that (deleteCampaign) — this dialog is just the confirm step.
 */
export function CampaignDeleteButton({
  campaignPublicId,
  name,
  /** Icon-only, no label — for a dense row-actions cell (matches RowActionButton elsewhere). */
  compact,
}: {
  campaignPublicId: string;
  name: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    try {
      await apiFetch(`/api/notifications/campaigns/${campaignPublicId}`, { method: "DELETE" });
      toast.success("Campaign deleted");
      setOpen(false);
      router.push("/dashboard/notifications/campaigns");
    } catch {
      // apiFetch already toasted the failure detail (e.g. "already sending").
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {compact ? (
        <Button variant="ghost" size="icon" aria-label="Delete" title="Delete" onClick={() => setOpen(true)}>
          <Trash2Icon className="size-4" />
        </Button>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Delete
        </Button>
      )}
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete "${name}"?`}
        description="This permanently removes the draft and its content. Only a draft or scheduled campaign can be deleted."
      >
        <div className="flex justify-end gap-2 p-4 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}
