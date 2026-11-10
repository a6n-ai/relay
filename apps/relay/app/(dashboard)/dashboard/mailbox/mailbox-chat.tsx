"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpIcon, Loader2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { Textarea } from "@foundry/ui/textarea";
import { apiFetch } from "@relay/engine/ui/api-fetch";
import type { ComposeFromOption } from "@/lib/mailbox/compose-from";
import type { ReaderLetter } from "@relay/engine";
import { MailboxLetterBody } from "./mailbox-letter";

export type ChatLetter = {
  publicId: string;
  inbound: boolean;
  from: string;
  initial: string;
  time: string;
  subject: string | null;
  html: string;
  htmlSafe: string;
  text: string;
  reader: ReaderLetter;
};

export function MailboxChat({
  letters,
  froms,
  replyTo,
  replySubject,
  replyToId,
}: {
  letters: ChatLetter[];
  froms: ComposeFromOption[];
  replyTo: string;
  replySubject: string;
  replyToId: string;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fromId, setFromId] = useState(froms[0]?.id ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const from = froms.find((f) => f.id === fromId) ?? froms[0];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [letters.length]);

  async function send() {
    const body = text.trim();
    if (!body || !from || busy) return;
    setBusy(true);
    try {
      await apiFetch("/api/notifications/mailbox/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromId: from.id,
          to: replyTo.trim(),
          subject: replySubject.trim(),
          text: body,
          replyToId,
        }),
      });
      setText("");
      router.refresh();
    } catch {
      /* apiFetch toasts the error */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col">
      <div ref={scrollRef} className="h-[calc(100dvh-16rem)] min-h-[24rem] overflow-y-auto pr-1">
        <div className="flex flex-col gap-4">
          {letters.map((letter) => (
            <article
              key={letter.publicId}
              className={cn("flex items-start gap-2", !letter.inbound && "flex-row-reverse")}
            >
              <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground text-sm font-medium">
                {letter.initial}
              </div>
              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-1",
                  letter.inbound ? "items-start" : "items-end",
                )}
              >
                <p className="text-xs text-muted-foreground">
                  {letter.from} · {letter.time}
                </p>
                {letter.subject ? <p className="text-sm font-medium">{letter.subject}</p> : null}
                <MailboxLetterBody
                  html={letter.html}
                  htmlSafe={letter.htmlSafe}
                  reader={letter.reader}
                  inbound={letter.inbound}
                />
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        {froms.length === 0 || !from ? (
          <p className="text-muted-foreground text-sm">
            Add a default From under Email sending, or a proven From on an app, then come back.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>From</span>
              {froms.length > 1 ? (
                <select
                  aria-label="From"
                  className="border-input bg-background h-7 border px-2 text-xs text-foreground"
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                >
                  {froms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.email}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-foreground">{from.email}</span>
              )}
            </div>
            <div className="flex items-end gap-2">
              <Textarea
                id="mailbox-composer"
                rows={1}
                value={text}
                placeholder="Write a reply…"
                aria-label="Reply"
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
                className="field-sizing-content max-h-48 min-h-9 flex-1 resize-none"
              />
              <Button
                type="button"
                size="icon"
                aria-label="Send"
                className="shrink-0 rounded-full"
                disabled={busy || !text.trim()}
                onClick={() => void send()}
              >
                {busy ? <Loader2Icon className="animate-spin" /> : <ArrowUpIcon />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
