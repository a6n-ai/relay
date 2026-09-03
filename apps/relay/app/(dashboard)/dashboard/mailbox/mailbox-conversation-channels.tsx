"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/design-system";

export function MailboxConversationChannels({ mail }: { mail: ReactNode }) {
  return (
    <Tabs defaultValue="mail" className="gap-3">
      <TabsList variant="line" className="rounded-none">
        <TabsTrigger value="mail" className="rounded-none">
          Mail
        </TabsTrigger>
        <TabsTrigger value="whatsapp" className="rounded-none">
          WhatsApp
        </TabsTrigger>
      </TabsList>
      <TabsContent value="mail">{mail}</TabsContent>
      <TabsContent value="whatsapp">
        <p className="text-muted-foreground text-sm">
          WhatsApp joins this conversation later. Mail stays in Mailbox.
        </p>
      </TabsContent>
    </Tabs>
  );
}
