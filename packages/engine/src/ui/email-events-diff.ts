// Mirrors @relay/email events/types: the engine UI can't depend on that package
// (it would drag AWS client code into client bundles). Shapes stay structurally compatible.
export const EMAIL_EVENT_TYPES = [
  "send", "delivery", "delivery_delay", "open", "click",
  "bounce", "complaint", "reject", "rendering_failure", "subscription",
] as const;
export type EmailEventType = (typeof EMAIL_EVENT_TYPES)[number];
export interface EmailEventRouting { webhook: EmailEventType[]; counts: EmailEventType[] | null }
export interface EmailStreamInfo { id: string; label: string; kind: "untracked" | "tracked" | "marketing" }

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
