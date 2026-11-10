"use client";

import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { CheckIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { type AsyncActionStatus, useAsyncAction } from "./use-async-action";

type Props = Omit<ComponentProps<typeof Button>, "onClick" | "children"> & {
  /** Resolve for success, throw (or reject) for failure. */
  onAction: () => unknown;
  children: string;
  pendingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
};

const ICON: Record<AsyncActionStatus, React.ReactNode> = {
  idle: null,
  pending: <Loader2Icon className="animate-spin motion-reduce:animate-none" />,
  success: <CheckIcon />,
  error: <TriangleAlertIcon />,
};

/**
 * A button that shows its own pending, done and failed states. Every label is laid out in one
 * grid cell, so the button keeps the width of the longest and never jumps while it changes.
 */
export function LoadingButton({
  onAction,
  children,
  pendingLabel = children,
  successLabel = "Done",
  errorLabel = "Try again",
  disabled,
  className,
  ...rest
}: Props) {
  const { status, run, pending } = useAsyncAction({ action: onAction });
  const faces: [AsyncActionStatus, string][] = [
    ["idle", children],
    ["pending", pendingLabel],
    ["success", successLabel],
    ["error", errorLabel],
  ];
  return (
    <Button
      {...rest}
      type="button"
      disabled={disabled}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onClick={(e) => {
        if (pending) return e.preventDefault();
        run();
      }}
      className={cn("grid", className)}
    >
      {faces.map(([key, text]) => (
        <span
          key={key}
          aria-hidden={key !== status}
          className={cn(
            "col-start-1 row-start-1 inline-flex items-center justify-center gap-2 transition-opacity duration-150",
            key === status ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {ICON[key]}
          {text}
        </span>
      ))}
    </Button>
  );
}
