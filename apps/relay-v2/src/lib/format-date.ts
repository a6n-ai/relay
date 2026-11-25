const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function toMs(d: Date | number | string): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

function parts(d: Date | number | string, tz?: string) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(toMs(d))) out[p.type] = p.value;
  return out;
}

export function formatDate(d: Date | number | string, tz?: string): string {
  const p = parts(d, tz);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export function formatWhen(d: Date | number | string, now = Date.now(), tz?: string): string {
  const diff = now - toMs(d);
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return formatDate(d, tz).slice(0, 10);
}
