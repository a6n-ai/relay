import { useBlocker } from "@tanstack/react-router";
import { type RefObject, useEffect } from "react";
import { ConfirmDialog } from "./confirm-dialog";

// bypass lets a save or delete that navigates on purpose skip the prompt.
export function UnsavedGuard({ when, bypass }: { when: boolean; bypass?: RefObject<boolean> }) {
  const blocker = useBlocker({
    shouldBlockFn: () => !bypass?.current,
    withResolver: true,
    disabled: !when,
  });

  useEffect(() => {
    if (!when) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (bypass?.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [when, bypass]);

  return (
    <ConfirmDialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => !open && blocker.status === "blocked" && blocker.reset()}
      title="Discard changes?"
      description="Your unsaved changes will be lost."
      confirmLabel="Discard"
      dismissLabel="Keep editing"
      onConfirm={async () => {
        if (blocker.status === "blocked") blocker.proceed();
      }}
    />
  );
}
