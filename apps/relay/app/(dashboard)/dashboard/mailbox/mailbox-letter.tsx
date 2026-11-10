"use client";

import { useState, type ReactNode } from "react";
import type { ReaderLetter } from "@relay/engine";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/design-system";
import { Panel } from "@/components/ds/panel";
import { cn } from "@foundry/ui/cn";

type View = "message" | "html" | "source";

const READER_STYLES =
  "text-sm leading-relaxed text-foreground break-words [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:my-2 [&_td]:pr-3 [&_td]:align-top [&_pre]:whitespace-pre-wrap [&_pre]:font-mono [&_pre]:text-xs [&_h1]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold";

const FRAME_HEAD =
  '<base target="_blank"><meta name="referrer" content="no-referrer"><style>html,body{margin:0}body{padding:16px}</style>';

function Reader({ html, className }: { html: string; className?: string }) {
  // html comes from emailHtmlToReader (strict allowlist, server side).
  return <div className={cn("mail-reader", READER_STYLES, className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

function ReaderMessage({ reader }: { reader: ReaderLetter }) {
  const [showSignature, setShowSignature] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Reader html={reader.body} />
      {reader.signature && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-expanded={showSignature}
            onClick={() => setShowSignature((v) => !v)}
            className="text-muted-foreground w-fit text-xs underline-offset-2 hover:underline"
          >
            Signature
          </button>
          {showSignature && <Reader html={reader.signature} className="text-xs text-muted-foreground" />}
        </div>
      )}
      {reader.quoted && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-label="Show quoted text"
            aria-expanded={showQuoted}
            onClick={() => setShowQuoted((v) => !v)}
            className="bg-background/60 text-muted-foreground hover:bg-background w-fit rounded-full border border-border px-2 text-xs leading-5"
          >
            …
          </button>
          {showQuoted && (
            <Reader html={reader.quoted} className="border-l-2 border-border pl-3 text-muted-foreground" />
          )}
        </div>
      )}
    </div>
  );
}

// No allow-same-origin: the letter gets an opaque origin, so its relative URLs can't
// reach Relay with the operator's cookies. The cost is no auto-height; the box resizes by hand.
function OriginalFrame({ htmlSafe }: { htmlSafe: string }) {
  return (
    <div className="h-[32rem] resize-y overflow-hidden rounded-lg border border-border bg-white">
      <iframe
        title="Letter preview"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={FRAME_HEAD + htmlSafe}
        className="block size-full border-0"
      />
    </div>
  );
}

export function MailboxLetterBody({
  html,
  htmlSafe,
  reader,
  inbound,
}: {
  html: string;
  htmlSafe: string;
  reader: ReaderLetter;
  inbound: boolean;
}) {
  const hasHtml = html.trim() !== "";
  const hasMessage = reader.body.trim() !== "";
  const [selected, setSelected] = useState<View>(hasMessage ? "message" : "html");

  const views: { value: View; label: string }[] = [];
  if (hasMessage) views.push({ value: "message", label: "Message" });
  if (hasHtml) {
    views.push({ value: "html", label: "Original" }, { value: "source", label: "Source" });
  }

  if (views.length === 0) {
    return <p className="text-muted-foreground text-sm">No content.</p>;
  }

  const active = views.some((v) => v.value === selected) ? selected : views[0].value;

  const content: Record<View, ReactNode> = {
    message: <ReaderMessage reader={reader} />,
    html: <OriginalFrame htmlSafe={htmlSafe} />,
    source: (
      <Panel as="pre" className="max-h-[32rem] overflow-auto p-4 font-mono text-sm whitespace-pre-wrap">
        {html}
      </Panel>
    ),
  };

  const wide = active !== "message";
  const bubble = cn(
    "rounded-2xl px-4 py-3 text-foreground",
    wide ? "w-full max-w-[80%]" : "max-w-[80%]",
    inbound ? "bg-muted rounded-tl-sm" : "bg-primary/10 rounded-tr-sm",
  );

  if (views.length === 1) {
    return <div className={bubble}>{content[active]}</div>;
  }

  return (
    <div className={bubble}>
      <Tabs value={active} onValueChange={(v) => setSelected(v as View)} className="gap-2">
        <TabsList variant="line">
          {views.map((view) => (
            <TabsTrigger key={view.value} value={view.value} className="text-xs">
              {view.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {views.map((view) => (
          <TabsContent key={view.value} value={view.value}>
            {content[view.value]}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
