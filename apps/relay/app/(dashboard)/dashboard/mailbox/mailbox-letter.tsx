"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/design-system";
import { Panel } from "@/components/ds/panel";

export function MailboxLetterBody({ html, text }: { html: string; text: string }) {
  return (
    <Tabs defaultValue="preview" className="gap-3">
      <TabsList variant="line" >
        <TabsTrigger value="preview" >
          Preview
        </TabsTrigger>
        <TabsTrigger value="text" >
          Plain text
        </TabsTrigger>
        <TabsTrigger value="html" >
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
        <Panel as="pre" className="max-h-[32rem] overflow-auto p-4 font-mono text-sm whitespace-pre-wrap">
          {text || "No plain text version."}
        </Panel>
      </TabsContent>
      <TabsContent value="html">
        <Panel as="pre" className="max-h-[32rem] overflow-auto p-4 font-mono text-sm whitespace-pre-wrap">
          {html}
        </Panel>
      </TabsContent>
    </Tabs>
  );
}
