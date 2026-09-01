import { TrendingUpIcon } from "lucide-react";
import type { Channel } from "@relay/engine";
import { Badge } from "@foundry/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { RELAY_CHANNELS } from "./channels";
import { CHANNEL_TONE } from "./overview-stats";
import { StackedSparkBars } from "./spark-bars";

function toneClass(tone: "ok" | "bad" | "neutral"): string {
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

export function ThroughputCard({
  total,
  byChannel,
  delta,
}: {
  total: number;
  byChannel: Record<Channel, number[]>;
  delta: { label: string; tone: "ok" | "bad" | "neutral" };
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUpIcon className="text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Volume</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-base font-normal leading-6">Outbox volume</span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="nums text-2xl font-semibold leading-8 tracking-tight">
              {total.toLocaleString()}
            </span>
            <Badge className={toneClass(delta.tone)}>{delta.label}</Badge>
            <span className="text-sm font-normal text-muted-foreground">vs prior week</span>
          </div>
        </div>
        <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {RELAY_CHANNELS.map((c) => (
            <li key={c.key} className="flex items-center gap-1.5">
              <span className={`size-2 ${CHANNEL_TONE[c.key]}`} />
              {c.label}
            </li>
          ))}
        </ul>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No sends in the last 7 days.</p>
        ) : (
          <StackedSparkBars byChannel={byChannel} label="Daily outbox volume by channel, last 7 days" />
        )}
      </CardContent>
    </Card>
  );
}
