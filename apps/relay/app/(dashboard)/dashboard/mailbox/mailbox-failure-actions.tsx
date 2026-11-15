"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { apiFetch } from "@relay/engine/ui/api-fetch";

type RetryOutcome = "inserted" | "duplicate" | "failed";

export function MailboxFailureActions({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      const { outcome } = await apiFetch<{ outcome: RetryOutcome }>(`/api/mailbox/failures/${publicId}/retry`, {
        method: "POST",
      });
      if (outcome === "failed") {
        toast.error("The email still could not be read");
        return;
      }
      toast.success(outcome === "duplicate" ? "That email is already in the inbox" : "Email added to the inbox");
      router.refresh();
    } catch {
      /* apiFetch toasts the error and the banner stays */
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void retry()}>
        {busy ? <Loader2Icon className="animate-spin" /> : null}
        Retry
      </Button>
      <Button asChild variant="ghost" size="sm">
        <a href={`/api/mailbox/failures/${publicId}/raw`} download>
          Download raw .eml
        </a>
      </Button>
    </>
  );
}
