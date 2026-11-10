import type { Channel } from "@relay/engine";
import { LightbulbIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { RELAY_CHANNELS } from "./channels";
import { CHANNEL_TONE } from "./overview-stats";
import { StatusBadge } from "./status-badge";


export function KeyInsightsCard({
  total,
  delta,
  mix,
}: {
  total: number;
  delta: { label: string; tone: "ok" | "bad" | "neutral" };
  mix: Record<Channel, number>;
}) {
  const max = Math.max(1, ...RELAY_CHANNELS.map((c) => mix[c.key]));
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="border-b border-border">
        <div className="flex items-center gap-2">
          <LightbulbIcon className="text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Key insights</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Last 7 days</p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="nums text-3xl font-semibold tracking-tight">{total.toLocaleString()}</p>
            <StatusBadge tone={delta.tone}>
              {delta.label} vs prior week
            </StatusBadge>
          </div>
        </div>
        <div className="flex items-end gap-1" aria-label="Channel mix">
          {RELAY_CHANNELS.map((c) => (
            <div key={c.key} className="flex flex-1 flex-col items-stretch gap-2">
              <div
                className={CHANNEL_TONE[c.key]}
                style={{ height: `${Math.max(8, (mix[c.key] / max) * 72)}px` }}
              />
              <span className="truncate text-[10px] text-muted-foreground">{c.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
