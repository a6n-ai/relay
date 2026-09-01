import type { Channel } from "@relay/engine";
import { RELAY_CHANNELS } from "./channels";

export const DAY_MS = 24 * 60 * 60 * 1000;

export const CHANNEL_TONE = {
  email: "bg-chart-1",
  sms: "bg-chart-2",
  whatsapp: "bg-chart-3",
  in_app: "bg-chart-4",
} as const satisfies Record<Channel, string>;

export const CHANNEL_STROKE = {
  email: "var(--chart-1)",
  sms: "var(--chart-2)",
  whatsapp: "var(--chart-3)",
  in_app: "var(--chart-4)",
} as const satisfies Record<Channel, string>;

export function percentDelta(current: number, previous: number): {
  label: string;
  tone: "ok" | "bad" | "neutral";
} {
  if (previous <= 0 && current <= 0) return { label: "0%", tone: "neutral" };
  if (previous <= 0) return { label: "new", tone: "ok" };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { label: `+${pct}%`, tone: "ok" };
  if (pct < 0) return { label: `${pct}%`, tone: "bad" };
  return { label: "0%", tone: "neutral" };
}

export const EMPTY_CHANNEL_COUNTS: Record<Channel, number> = {
  email: 0,
  sms: 0,
  whatsapp: 0,
  in_app: 0,
};

export function countByChannel(rows: { channel: Channel }[]): Record<Channel, number> {
  const out = { ...EMPTY_CHANNEL_COUNTS };
  for (const row of rows) out[row.channel] += 1;
  return out;
}

export function lastSevenDayChannelBuckets(
  rows: { createdAt: number; channel: Channel }[],
  now = Date.now(),
): { totals: number[]; byChannel: Record<Channel, number[]>; channelTotals: Record<Channel, number> } {
  const start = now - 6 * DAY_MS;
  const byChannel = Object.fromEntries(
    RELAY_CHANNELS.map((c) => [c.key, Array.from({ length: 7 }, () => 0)]),
  ) as Record<Channel, number[]>;
  const totals = Array.from({ length: 7 }, () => 0);

  for (const row of rows) {
    const i = Math.floor((row.createdAt - start) / DAY_MS);
    if (i < 0 || i > 6) continue;
    byChannel[row.channel][i] += 1;
    totals[i] += 1;
  }

  const channelTotals = Object.fromEntries(
    RELAY_CHANNELS.map((c) => [c.key, byChannel[c.key].reduce((a, b) => a + b, 0)]),
  ) as Record<Channel, number>;

  return { totals, byChannel, channelTotals };
}
