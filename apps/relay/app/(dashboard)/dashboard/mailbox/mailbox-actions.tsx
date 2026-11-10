"use client";

import { useState, type ReactNode } from "react";
import { CopyIcon, ForwardIcon, HashIcon, MailPlusIcon, ReplyIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import type { ComposeFromOption } from "@/lib/mailbox/compose-from";
import { MailboxCompose } from "./mailbox-compose";

function CopyButton({ value, label, icon }: { value: string; label: string; icon: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {icon}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function MailboxQuickActions({
  froms,
  contact,
  forwardSubject,
  forwardText,
  messageId,
}: {
  froms: ComposeFromOption[];
  contact: string;
  forwardSubject: string;
  forwardText: string;
  messageId: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={() => document.getElementById("mailbox-composer")?.focus()}
      >
        <ReplyIcon />
        Reply
      </Button>
      <MailboxCompose
        froms={froms}
        label="Forward"
        icon={<ForwardIcon />}
        quiet
        defaultSubject={forwardSubject}
        defaultText={forwardText}
      />
      <MailboxCompose froms={froms} label="New letter" icon={<MailPlusIcon />} quiet defaultTo={contact} />
      <CopyButton value={contact} label="Copy address" icon={<CopyIcon />} />
      {messageId ? <CopyButton value={messageId} label="Copy Message-ID" icon={<HashIcon />} /> : null}
    </div>
  );
}
