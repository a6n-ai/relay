import type { Channel } from "@relay/engine";
import { PieChartIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { RELAY_CHANNELS, channelLabel } from "./channels";
import { CHANNEL_STROKE } from "./overview-stats";
import { channelShares } from "./channel-flow";
import { toneBadgeClass } from "./tone";


export function ChannelDistribution({
  counts,
  deltas,
}: {
  counts: Record<Channel, number>;
  deltas: Record<Channel, { label: string; tone: "ok" | "bad" | "neutral" }>;
}) {
  const total = RELAY_CHANNELS.reduce((s, c) => s + counts[c.key], 0);
  const shares = channelShares(RELAY_CHANNELS.map((c) => counts[c.key]));

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="border-b border-border">
        <div className="flex items-center gap-2">
          <PieChartIcon className="text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Where messages went</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <svg viewBox="0 0 240 150" className="w-full" aria-hidden>
          <g className="text-muted-foreground">
            <rect x="0" y="55" width="64" height="40" rx="8" fill="var(--muted)" />
            <text x="32" y="71" textAnchor="middle" fontSize="9" fill="currentColor">Your apps</text>
            <text x="32" y="87" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--foreground)">
              {total.toLocaleString()}
            </text>
          </g>
          {RELAY_CHANNELS.map((c, i) => {
            const y = 15 + i * 40;
            return (
              <g key={c.key}>
                <path
                  d={`M 64 75 C 110 75 100 ${y} 146 ${y}`}
                  fill="none"
                  stroke={CHANNEL_STROKE[c.key]}
                  strokeWidth={shares[i]!.width}
                  strokeOpacity={total === 0 ? 0.5 : 1}
                />
                <text x="152" y={y - 2} fontSize="9" fill="currentColor" className="text-muted-foreground">
                  {channelLabel(c.key)}
                </text>
                <text x="152" y={y + 10} fontSize="11" fontWeight="600" fill="var(--foreground)">
                  {counts[c.key].toLocaleString()} · {shares[i]!.pct}%
                </text>
              </g>
            );
          })}
        </svg>
        <ul className="flex flex-col gap-3">
          {RELAY_CHANNELS.map((c, i) => (
            <li key={c.key} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm">
                <span className="size-2" style={{ background: CHANNEL_STROKE[c.key] }} />
                {channelLabel(c.key)}
              </span>
              <span className="flex items-center gap-2">
                <span className="nums text-sm font-medium">
                  {counts[c.key].toLocaleString()}
                  <span className="sr-only">, </span>
                  <span className="text-muted-foreground ml-1 font-normal">{shares[i]!.pct}%</span>
                </span>
                <Badge className={toneBadgeClass(deltas[c.key].tone)}>{deltas[c.key].label}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
