"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@foundry/ui/button";
import { EmailOtpPanel } from "../../login/auth-form";
import { acceptInvitationAction } from "./actions";

export function SignInForInvite({ email }: { email: string }) {
  const router = useRouter();
  return <EmailOtpPanel fixedEmail={email} onSignedIn={() => router.refresh()} />;
}

export function AcceptInviteButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function accept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptInvitationAction(invitationId);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Button className="w-full" disabled={pending} onClick={accept}>
        Accept invite
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
