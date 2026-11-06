import { EMAIL_EVENT_TYPES, type EmailEventRouting, type EmailEventType, type EmailStream } from "@relay/email/events/types";

export { EMAIL_EVENT_TYPES };
export type { EmailEventRouting, EmailEventType, EmailStream };

export const typeLabel = (t: string) => t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export const FORCED_WEBHOOK: readonly EmailEventType[] = ["bounce", "complaint"];

function column(name: string, before: readonly EmailEventType[], after: readonly EmailEventType[], forced: readonly EmailEventType[] = []): string | null {
  const added = after.filter((t) => !before.includes(t));
  const removed = before.filter((t) => !after.includes(t) && !forced.includes(t));
  const parts = [...added.map((t) => `+${typeLabel(t)}`), ...removed.map((t) => `-${typeLabel(t)}`)];
  return parts.length ? `${name} ${parts.join(", ")}` : null;
}

export function routingDiff(before: EmailEventRouting, after: EmailEventRouting, label?: string): string[] {
  const lines = [
    column("Webhook", before.webhook, after.webhook, FORCED_WEBHOOK),
    before.counts && after.counts ? column("Counts", before.counts, after.counts) : null,
  ].filter((l): l is string => l !== null);
  return label ? lines.map((l) => `${label}: ${l}`) : lines;
}
