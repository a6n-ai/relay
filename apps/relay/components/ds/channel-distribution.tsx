import type { Channel } from "@relay/engine";
import { PieChartIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { RELAY_CHANNELS, channelLabel } from "./channels";
import { CHANNEL_STROKE } from "./overview-stats";

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

const RADIUS = 72;
const CIRC = Math.PI * RADIUS;

export function ChannelDistribution({
  counts,
  deltas,
}: {
  counts: Record<Channel, number>;
  deltas: Record<Channel, { label: string; tone: "ok" | "bad" | "neutral" }>;
}) {
  const total = RELAY_CHANNELS.reduce((s, c) => s + counts[c.key], 0);
  let cursor = 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="border-b border-border">
        <div className="flex items-center gap-2">
          <PieChartIcon className="text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Channel mix</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <div className="relative mx-auto w-full max-w-[220px]">
          <svg viewBox="0 0 180 110" className="w-full" aria-hidden>
            <g transform="translate(90 100)">
              <path
                d="M -72 0 A 72 72 0 0 1 72 0"
                fill="none"
                stroke="var(--border)"
                strokeWidth="16"
                strokeLinecap="butt"
              />
              {RELAY_CHANNELS.map((c) => {
                const share = total === 0 ? 0 : counts[c.key] / total;
                const len = share * CIRC;
                const dashoffset = -cursor;
                cursor += len;
                return (
                  <path
                    key={c.key}
                    d="M -72 0 A 72 72 0 0 1 72 0"
                    fill="none"
                    stroke={CHANNEL_STROKE[c.key]}
                    strokeWidth="16"
                    strokeDasharray={`${len} ${CIRC}`}
                    strokeDashoffset={dashoffset}
                    strokeLinecap="butt"
                  />
                );
              })}
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-x-0 bottom-1 flex flex-col items-center">
            <span className="text-[10px] tracking-wide text-muted-foreground uppercase">Total</span>
            <span className="nums text-lg font-semibold">{total.toLocaleString()}</span>
          </div>
        </div>
        <ul className="flex flex-col gap-3">
          {RELAY_CHANNELS.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm">
                <span className="size-2" style={{ background: CHANNEL_STROKE[c.key] }} />
                {channelLabel(c.key)}
              </span>
              <span className="flex items-center gap-2">
                <span className="nums text-sm font-medium">{counts[c.key].toLocaleString()}</span>
                <Badge className={toneClass(deltas[c.key].tone)}>{deltas[c.key].label}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
