import type { ComponentProps } from "react";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { DialogClose } from "@foundry/ui/dialog";

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
  onCancel,
  cancel,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  children?: React.ReactNode;
  submitLabel?: string;
  pending?: boolean;
  pendingLabel?: string;
  onCancel?: () => void;
  cancel?: boolean;
}) {
  return (
    <div className={cn("flex justify-end gap-2", className)} {...props}>
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      ) : cancel ? (
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
      ) : null}
      {children}
      {submitLabel ? (
        <Button type="submit" disabled={pending}>
          {pending ? (pendingLabel ?? submitLabel) : submitLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function FormPanel({ as: Tag = "div", className, ...props }: ComponentProps<"div"> & { as?: "form" | "div" }) {
  const T = Tag as "div";
  return <T className={cn("grid max-w-2xl gap-4 px-4 pb-4", className)} {...props} />;
}
