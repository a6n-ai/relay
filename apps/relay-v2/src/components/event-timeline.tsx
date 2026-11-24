export type TimelineItem = { label: string; at: number; detail?: string | null };

// Fixed locale and zone: the Worker and the browser must render the same text or React re-renders on hydration.
const WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZoneName: "short",
});
export const formatWhen = (at: number) => WHEN.format(at);

export function EventTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="grid gap-3">
      {items.map((item, i) => (
        <li key={i} className="grid gap-0.5 border-l-2 border-border pl-3">
          <span className="text-sm font-medium">{item.label}</span>
          <time className="text-xs text-muted-foreground tabular-nums" dateTime={new Date(item.at).toISOString()}>
            {formatWhen(item.at)}
          </time>
          {item.detail ? <span className="text-xs break-words text-muted-foreground">{item.detail}</span> : null}
        </li>
      ))}
    </ol>
  );
}
