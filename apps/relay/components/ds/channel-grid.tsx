import Link from "next/link";
import { BoxIcon, InboxIcon, MailIcon, MessageCircleIcon, SmartphoneIcon } from "lucide-react";
import type { Channel } from "@relay/engine";
import { Button } from "@foundry/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { RELAY_CHANNELS, channelLabel } from "./channels";

const ICONS = {
  email: MailIcon,
  sms: SmartphoneIcon,
  whatsapp: MessageCircleIcon,
  in_app: InboxIcon,
} as const;

export function ChannelGrid({ counts }: { counts: Partial<Record<Channel, number>> }) {
  return (
    <Card className="flex h-full flex-col gap-0 pb-0">
      <CardHeader className="border-b border-border">
        <div className="flex items-center gap-2">
          <BoxIcon className="text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Channels</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="h-full px-0">
        <div className="lyra-pack grid h-full grid-cols-2">
          {RELAY_CHANNELS.map((ch) => {
            const Icon = ICONS[ch.key];
            return (
              <Link
                key={ch.key}
                href={ch.href}
                className="flex flex-col justify-between gap-6 bg-card p-6 transition-colors hover:bg-muted/40"
              >
                <Button variant="outline" size="icon" className="pointer-events-none size-8">
                  <Icon />
                </Button>
                <div>
                  <p className="nums text-2xl font-semibold">{counts[ch.key] ?? 0}</p>
                  <p className="text-sm font-normal">{channelLabel(ch.key)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
