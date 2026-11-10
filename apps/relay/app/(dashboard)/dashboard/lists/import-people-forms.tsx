"use client";

import { useState } from "react";
import { ContactListManualAdd } from "@relay/engine/ui/contact-list-manual-add";
import { ContactListUpload } from "@relay/engine/ui/contact-list-upload";
import { cn } from "@foundry/ui/cn";
import { useCreateDialog } from "@/components/ds/create-dialog";

const WAYS = [
  { id: "sheet", label: "Spreadsheet" },
  { id: "hand", label: "By hand" },
] as const;

/** The two ways to build a group of people, inside the Import people dialog. */
export function ImportPeopleForms() {
  const [way, setWay] = useState<(typeof WAYS)[number]["id"]>("sheet");
  const { created } = useCreateDialog();
  const onCreated = (r: { name: string; imported: number }) => created({ noun: "Group", name: r.name });
  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="How to add people" className="flex gap-1">
        {WAYS.map((w) => (
          <button
            key={w.id}
            type="button"
            aria-pressed={way === w.id}
            onClick={() => setWay(w.id)}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-2.5 text-[13px] font-medium transition-colors",
              way === w.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {w.label}
          </button>
        ))}
      </div>
      {way === "sheet" ? <ContactListUpload onCreated={onCreated} /> : <ContactListManualAdd onCreated={onCreated} />}
    </div>
  );
}
