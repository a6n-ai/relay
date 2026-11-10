"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/design-system";
import { Panel } from "@/components/ds/panel";
import { cn } from "@foundry/ui/cn";

type View = "message" | "html" | "source";

export function MailboxLetterBody({
  html,
  text,
  inbound,
}: {
  html: string;
  text: string;
  inbound: boolean;
}) {
  const hasHtml = html.trim() !== "";
  const hasText = text.trim() !== "";
  const [selected, setSelected] = useState<View>(hasText ? "message" : "html");

  const views: { value: View; label: string }[] = [];
  if (hasText) views.push({ value: "message", label: "Message" });
  if (hasHtml) {
    views.push({ value: "html", label: "HTML" }, { value: "source", label: "Source" });
  }

  if (views.length === 0) {
    return <p className="text-muted-foreground text-sm">No content.</p>;
  }

  const active = views.some((v) => v.value === selected) ? selected : views[0].value;

  const content: Record<View, ReactNode> = {
    message: (
      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">{text}</p>
    ),
    html: (
      <iframe
        title="Letter preview"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={html}
        className="h-[28rem] w-full resize-y rounded-md border border-border bg-white"
      />
    ),
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
