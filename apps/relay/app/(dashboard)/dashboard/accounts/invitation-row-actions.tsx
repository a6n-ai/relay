"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { cancelInvitationAction, resendInvitationAction } from "./actions";

export function InvitationRowActions({
  invitationId,
  email,
  canCreate,
  canCancel,
}: {
  invitationId: string;
  email: string;
  canCreate: boolean;
  canCancel: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string }>, success: string) {
    startTransition(async () => {
      const res = await action();
      if (res.error) toast.error(res.error);
      else toast.success(success);
    });
  }

  return (
    <span className="flex justify-end gap-2">
      {canCreate ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          aria-label={`Resend invite to ${email}`}
          onClick={() => run(() => resendInvitationAction(invitationId), "Invite sent again")}
        >
          Resend
        </Button>
      ) : null}
      {canCancel ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          aria-label={`Cancel invite to ${email}`}
          onClick={() => run(() => cancelInvitationAction(invitationId), "Invite cancelled")}
        >
          Cancel
        </Button>
      ) : null}
    </span>
  );
}
