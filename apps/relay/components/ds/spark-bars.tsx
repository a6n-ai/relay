import type { Channel } from "@relay/engine";
import { RELAY_CHANNELS } from "./channels";
import { CHANNEL_TONE } from "./overview-stats";

export function SparkBars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-28 items-end gap-1" aria-label={label}>
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 bg-primary/80"
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** Stacked daily columns — Shell 03 “website visits” density, channel mix as layers. */
export function StackedSparkBars({
  byChannel,
  label,
}: {
  byChannel: Record<Channel, number[]>;
  label: string;
}) {
  const days = byChannel.email.length;
  const dayTotals = Array.from({ length: days }, (_, i) =>
    RELAY_CHANNELS.reduce((sum, c) => sum + byChannel[c.key][i], 0),
  );
  const max = Math.max(1, ...dayTotals);

  return (
    <div className="flex h-44 items-end gap-1" aria-label={label}>
      {dayTotals.map((total, i) => (
        <div
          key={i}
          className="flex flex-1 flex-col-reverse gap-px"
          style={{ height: `${Math.max(12, (total / max) * 100)}%` }}
        >
          {RELAY_CHANNELS.map((c) => {
            const n = byChannel[c.key][i];
            if (n === 0) return null;
            return (
              <div
                key={c.key}
                className={CHANNEL_TONE[c.key]}
                style={{ flexGrow: n, minHeight: 2 }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
