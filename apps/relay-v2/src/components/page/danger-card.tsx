import { Button } from "@foundry/ui/button";
import { useState } from "react";
import { ConfirmDialog } from "../confirm-dialog";
import { SettingsCard } from "./settings-card";

// The card states the consequence once. The dialog asks for the name only when `typed` is given.
export function DangerCard({
  title,
  description,
  buttonLabel,
  confirmTitle,
  confirmLabel = buttonLabel,
  typed,
  onConfirm,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  confirmTitle: string;
  confirmLabel?: string;
  typed?: string;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingsCard
        tone="danger"
        title={title}
        description={description}
        action={
          <Button variant="destructive" onClick={() => setOpen(true)}>
            {buttonLabel}
          </Button>
        }
      />
      <ConfirmDialog open={open} onOpenChange={setOpen} title={confirmTitle} confirmLabel={confirmLabel} typed={typed} onConfirm={onConfirm} />
    </>
  );
}
