import type { ComponentProps } from "react";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { DialogClose } from "@foundry/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";
import { useId } from "react";

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function FormBody({ as: Tag = "form", className, ...props }: ComponentProps<"form"> & { as?: "form" | "div" }) {
  const T = Tag as "form";
  return <T className={cn("grid gap-3", className)} {...props} />;
}

// With `children` it is a plain row, as before. With `submitLabel` it renders Cancel then the primary.
// Cancel is opt-in: `onCancel` for pages, `cancel` for a DialogClose inside a dialog.
export function FormActions({
  className,
  children,
  submitLabel,
  pending,
  pendingLabel,
  disabled,
  disabledReason,
  onCancel,
  cancel,
  cancelLabel = "Cancel",
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  children?: React.ReactNode;
  submitLabel?: string;
  pending?: boolean;
  pendingLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  onCancel?: () => void;
  cancel?: boolean;
  cancelLabel?: string; // "Close" when the dialog has nothing to cancel
}) {
  const reasonId = useId();
  const reason = disabled && !pending ? disabledReason : undefined;
  const primary = submitLabel ? (
    <Button type="submit" disabled={pending || disabled} aria-describedby={reason ? reasonId : undefined}>
      {pending ? (pendingLabel ?? submitLabel) : submitLabel}
    </Button>
  ) : null;
  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-2", className)} {...props}>
      {reason ? (
        <p id={reasonId} className="min-w-0 basis-full text-xs text-muted-foreground sm:basis-0 sm:flex-1">
          {reason}
        </p>
      ) : null}
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      ) : cancel ? (
        <DialogClose render={<Button type="button" variant="ghost" />}>{cancelLabel}</DialogClose>
      ) : null}
      {children}
      {submitLabel ? (
        <Tooltip disabled={!reason}>
          <TooltipTrigger render={<span role="group" aria-label={submitLabel} tabIndex={reason ? 0 : undefined} className="inline-flex" />}>
            {primary}
          </TooltipTrigger>
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export function FormPanel({ as: Tag = "div", className, ...props }: ComponentProps<"div"> & { as?: "form" | "div" }) {
  const T = Tag as "div";
  return <T className={cn("grid max-w-2xl gap-4 px-4 pb-4", className)} {...props} />;
}
