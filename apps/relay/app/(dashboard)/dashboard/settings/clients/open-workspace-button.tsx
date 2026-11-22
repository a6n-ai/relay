"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@foundry/ui/button";
import { writeActiveAppCookie } from "@/lib/apps/active-app-cookie";
import { authClient } from "@/lib/auth/client";

export function OpenWorkspaceButton({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const { error } = await authClient.organization.setActive({ organizationId });
          if (error) return;
          writeActiveAppCookie(null);
          window.dispatchEvent(new Event("relay:workspace-changed"));
          router.push("/dashboard");
          router.refresh();
        });
      }}
    >
      {pending ? "Opening…" : "Open"}
    </Button>
  );
}
