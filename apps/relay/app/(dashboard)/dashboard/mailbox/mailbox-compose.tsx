"use client";

import { useState } from "react";
import { PenLineIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@foundry/ui/dialog";
import type { ComposeFromOption } from "@/lib/mailbox/compose-from";
import { SendMailboxLetterForm } from "./send-mailbox-letter-form";

export function MailboxCompose({
  froms,
  defaultTo,
  defaultSubject,
  replyToId,
  label = "Compose",
  pill = false,
}: {
  froms: ComposeFromOption[];
  defaultTo?: string;
  defaultSubject?: string;
  replyToId?: string;
  label?: string;
  /** The rounded lavender button used as an empty state's call to action. */
  pill?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isReply = Boolean(replyToId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size={pill ? "default" : "sm"} className={cn(pill && "rounded-full")}>
          <PenLineIcon />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-xl data-open:zoom-in-100 data-closed:zoom-out-100 top-auto right-4 bottom-4 left-auto max-h-[min(36rem,calc(100vh-2rem))] translate-x-0 translate-y-0 overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{isReply ? "Reply" : "New letter"}</DialogTitle>
          <DialogDescription>
            {isReply ? "Stays in this conversation in Mailbox." : "To, subject, and a short message."}
          </DialogDescription>
        </DialogHeader>
        <SendMailboxLetterForm
          froms={froms}
          defaultTo={defaultTo}
          defaultSubject={defaultSubject}
          replyToId={replyToId}
          onSent={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
