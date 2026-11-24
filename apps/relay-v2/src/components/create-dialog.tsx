import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@foundry/ui/dialog";
import { type ReactNode, useState } from "react";

// lock(true) while a one-time secret is showing: Esc and outside click are ignored, so only Done closes it.
export function CreateDialog({
  trigger,
  title,
  children,
}: {
  trigger: string;
  title: string;
  children: (done: () => void, lock: (locked: boolean) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const done = () => {
    setLocked(false);
    setOpen(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || !locked) setOpen(next);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>{trigger}</DialogTrigger>
      <DialogContent showCloseButton={!locked}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children(done, setLocked)}
      </DialogContent>
    </Dialog>
  );
}
