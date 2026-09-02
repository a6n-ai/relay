"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/design-system";

export function MailboxLetterBody({ html, text }: { html: string; text: string }) {
  return (
    <Tabs defaultValue="preview" className="gap-3">
      <TabsList variant="line" className="rounded-none">
        <TabsTrigger value="preview" className="rounded-none">
          Preview
        </TabsTrigger>
        <TabsTrigger value="text" className="rounded-none">
          Plain text
        </TabsTrigger>
        <TabsTrigger value="html" className="rounded-none">
          HTML
        </TabsTrigger>
      </TabsList>
      <TabsContent value="preview">
        <iframe
          title="Letter preview"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={html}
          className="min-h-[32rem] w-full border border-border bg-white"
        />
      </TabsContent>
      <TabsContent value="text">
        <pre className="max-h-[32rem] overflow-auto border border-border bg-card p-4 font-mono text-sm whitespace-pre-wrap">
          {text || "No plain text version."}
        </pre>
      </TabsContent>
      <TabsContent value="html">
        <pre className="max-h-[32rem] overflow-auto border border-border bg-card p-4 font-mono text-sm whitespace-pre-wrap">
          {html}
        </pre>
      </TabsContent>
    </Tabs>
  );
}
