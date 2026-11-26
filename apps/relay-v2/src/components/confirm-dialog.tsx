import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@foundry/ui/alert-dialog";
import { Button } from "@foundry/ui/button";
import type { ReactNode } from "react";

// Pass open and onOpenChange to drive it from outside (a router blocker); omit trigger then.
// children sit under the description (a typed-name field, a preview); confirmDisabled holds the confirm until they are satisfied.
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  open,
  onOpenChange,
  children,
  confirmDisabled = false,
}: {
  trigger?: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  confirmDisabled?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger !== undefined ? <AlertDialogTrigger render={<Button variant="outline" />}>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
          <AlertDialogClose render={<Button variant="destructive" disabled={confirmDisabled} onClick={onConfirm} />}>{confirmLabel}</AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
