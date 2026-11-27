import { Badge } from "@foundry/ui/badge";

export const STATUS = {
  pending: { tone: "warning", label: "Pending" },
  verified: { tone: "success", label: "Verified" },
  failed: { tone: "danger", label: "Failed" },
  queued: { tone: "info", label: "Queued" },
  sent: { tone: "success", label: "Sent" },
  suppressed: { tone: "neutral", label: "Suppressed" },
  subscribed: { tone: "success", label: "Subscribed" },
  draft: { tone: "neutral", label: "Draft" },
  scheduled: { tone: "info", label: "Scheduled" },
  sending: { tone: "info", label: "Sending" },
  paused: { tone: "warning", label: "Paused" },
  cancelled: { tone: "neutral", label: "Cancelled" },
  accepted: { tone: "success", label: "Accepted" },
  expired: { tone: "neutral", label: "Expired" },
  active: { tone: "success", label: "Active" },
  suspended: { tone: "danger", label: "Suspended" },
} as const;

// Inbound rows are stored as "sent"; the operator sees what happened to them, which is receipt.
export function StatusBadge({ status, direction }: { status: keyof typeof STATUS; direction?: string }) {
  if (direction === "in") return <Badge variant="success">Received</Badge>;
  return <Badge variant={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}
