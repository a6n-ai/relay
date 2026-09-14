"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@foundry/design-system";
import { apiFetch } from "./api-fetch";

/**
 * Delete an unused contact list. The route itself refuses a list any campaign
 * has ever named in its audience — this dialog is just the confirm step, the
 * actual guard lives server-side (deleteContactList).
 */
export function ContactListDeleteButton({
  publicId,
  name,
  /** Icon-only, no label — for a dense row-actions cell (matches RowActionButton elsewhere). */
  compact,
  /** After a successful delete: "refresh" (stay on a list page) or navigate back to the list index. */
  onDeleted,
}: {
  publicId: string;
  name: string;
  compact?: boolean;
  onDeleted?: "refresh" | "back";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    setBusy(true);
    try {
      await apiFetch(`/api/notifications/contact-lists/${publicId}`, { method: "DELETE" });
      toast.success("List deleted");
      setOpen(false);
      if (onDeleted === "back") router.push("/dashboard/notifications/contact-lists");
      else router.refresh();
    } catch {
      // apiFetch already toasted the failure detail (e.g. "used in a campaign").
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
        description="This permanently removes the list and its contacts. Refused if any campaign has ever used it."
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
