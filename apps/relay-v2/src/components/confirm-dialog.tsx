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
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { type ReactNode, useState } from "react";
import { errorText } from "./error-text";
import { FormError } from "./form-error";

// Pass open and onOpenChange to drive it from outside (a router blocker); omit trigger then.
// onConfirm must return a promise that rejects on failure: the dialog stays open while it runs and shows the error inline.
// children sit under the description (a preview); confirmDisabled holds the confirm until they are satisfied.
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  dismissLabel = "Cancel",
  destructive = true,
  typed,
  onConfirm,
  open,
  onOpenChange,
  children,
  confirmDisabled = false,
}: {
  trigger?: string;
  title: string;
  description?: string;
  confirmLabel: string;
  dismissLabel?: string;
  destructive?: boolean;
  typed?: string;
  onConfirm: () => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  confirmDisabled?: boolean;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const isOpen = open ?? innerOpen;
  const ready = !confirmDisabled && (typed === undefined || text.trim() === typed);

  function setOpen(next: boolean) {
    if (pending) return;
    if (!next) {
      setError(null);
      setText("");
    }
    setInnerOpen(next);
    onOpenChange?.(next);
  }

  async function confirm() {
    if (!ready || pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setPending(false);
      setOpen(false);
    } catch (err) {
      setPending(false);
      setError(errorText(err));
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setOpen}>
      {trigger !== undefined ? <AlertDialogTrigger render={<Button variant="outline" />}>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {children}
        {typed !== undefined ? (
          <Label className="flex flex-col items-start gap-1">
            Type {typed} to confirm
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void confirm();
                }
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </Label>
        ) : null}
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" disabled={pending} />}>{dismissLabel}</AlertDialogClose>
          <Button variant={destructive ? "destructive" : "default"} disabled={!ready || pending} onClick={() => void confirm()}>
            {pending ? `${confirmLabel}…` : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
