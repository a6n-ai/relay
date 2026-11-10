"use client";

import type { ReactNode } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@foundry/ui/dialog";

/** Linear-style create: a "New …" button that opens the form in a dialog over the list. */
export function CreateDialog({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
