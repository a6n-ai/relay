import { tzOffsetMinutes } from "@foundry/commons";

/** A `datetime-local` value ("YYYY-MM-DDTHH:mm") read as wall-clock time in `timeZone` → epoch ms. */
export function zonedLocalToEpoch(local: string, timeZone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // Date.UTC rolls 13/45 25:61 over into a real date; a value that does not round-trip was never valid.
  const back = new Date(asUtc);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || back.getUTCHours() !== h || back.getUTCMinutes() !== mi) return null;
  // ponytail: offset is read at the wall time treated as UTC, so the hour around a DST switch can be off by one.
  return asUtc - tzOffsetMinutes(timeZone, asUtc) * 60_000;
}
