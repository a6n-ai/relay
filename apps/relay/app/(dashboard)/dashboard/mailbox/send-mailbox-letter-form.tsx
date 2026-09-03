"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { apiFetch } from "@relay/engine/ui";
import type { ComposeFromOption } from "@/lib/mailbox/compose-from";

export function SendMailboxLetterForm({
  froms,
  defaultTo = "",
  defaultSubject = "",
  replyToId,
  onSent,
}: {
  froms: ComposeFromOption[];
  defaultTo?: string;
  defaultSubject?: string;
  replyToId?: string;
  onSent?: () => void;
}) {
  const router = useRouter();
  const [fromId, setFromId] = useState(froms[0]?.id ?? "");
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!fromId) return toast.error("Set a From address under Email sending first");
    if (!to.trim()) return toast.error("Add who this is for");
    if (!subject.trim()) return toast.error("Add a subject");
    if (!text.trim()) return toast.error("Write a short message");
    setBusy(true);
    try {
      await apiFetch("/api/notifications/mailbox/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromId,
          to: to.trim(),
          subject: subject.trim(),
          text: text.trim(),
          ...(replyToId ? { replyToId } : {}),
        }),
      });
      toast.success("Sent");
      setText("");
      onSent?.();
      router.refresh();
    } catch {
      /* toasted */
    } finally {
      setBusy(false);
    }
  }

  if (froms.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Add a default From under Email sending, or a proven From on an app, then come back.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="mbx-from">From</Label>
        <select
          id="mbx-from"
          className="border-input bg-background h-9 w-full border px-3 text-sm"
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
        >
          {froms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mbx-to">To</Label>
        <Input
          id="mbx-to"
          type="email"
          autoComplete="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mbx-subject">Subject</Label>
        <Input id="mbx-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mbx-text">Message</Label>
        <Textarea
          id="mbx-text"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" disabled={busy} onClick={() => void send()}>
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
