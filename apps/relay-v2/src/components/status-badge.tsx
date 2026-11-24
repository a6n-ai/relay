import { Badge } from "@foundry/ui/badge";

const TONE = {
  pending: "warning",
  verified: "success",
  failed: "danger",
  queued: "info",
  sent: "success",
  suppressed: "neutral",
  subscribed: "success",
  draft: "neutral",
  scheduled: "info",
  sending: "info",
  paused: "warning",
  cancelled: "neutral",
} as const;
const LABEL = {
  pending: "Pending",
  verified: "Verified",
  failed: "Failed",
  queued: "Queued",
  sent: "Sent",
  suppressed: "Suppressed",
  subscribed: "Subscribed",
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  paused: "Paused",
  cancelled: "Cancelled",
} as const;

// Inbound rows are stored as "sent"; the operator sees what happened to them, which is receipt.
export function StatusBadge({ status, direction }: { status: keyof typeof TONE; direction?: string }) {
  if (direction === "in") return <Badge variant="success">Received</Badge>;
  return <Badge variant={TONE[status]}>{LABEL[status]}</Badge>;
}
