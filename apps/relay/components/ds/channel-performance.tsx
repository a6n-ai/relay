import Link from "next/link";
import { ArrowRightIcon, MegaphoneIcon } from "lucide-react";
import type { Channel } from "@relay/engine";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@foundry/ui/card";
import { RELAY_CHANNELS, channelLabel } from "./channels";

function statusFor(count: number): { label: string; tone: "ok" | "bad" | "neutral" } {
  if (count > 0) return { label: "Active", tone: "ok" };
  return { label: "Idle", tone: "neutral" };
}

function badgeClass(tone: "ok" | "bad" | "neutral"): string {
  switch (tone) {
    case "ok":
      return "bg-chart-2/10 text-chart-2";
    case "bad":
      return "bg-destructive/10 text-destructive";
    case "neutral":
      return "bg-muted text-muted-foreground";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

export function ChannelPerformance({ counts }: { counts: Record<Channel, number> }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="border-b border-border">
        <div className="flex items-center gap-2">
          <MegaphoneIcon className="text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Channel performance</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-0 px-0">
        {RELAY_CHANNELS.map((c) => {
          const n = counts[c.key];
          const st = statusFor(n);
          return (
            <Link
              key={c.key}
              href={c.href}
              className="flex items-center justify-between gap-3 border-b border-border px-6 py-4 last:border-0 hover:bg-muted/40"
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{channelLabel(c.key)}</span>
                <span className="nums text-xs text-muted-foreground">{n.toLocaleString()} sends</span>
              </div>
              <Badge className={badgeClass(st.tone)}>{st.label}</Badge>
            </Link>
          );
        })}
      </CardContent>
      <CardFooter className="border-t border-border">
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/campaigns">
            See report
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
