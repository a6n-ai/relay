import { Badge } from "@foundry/ui/badge";

type OutboxStatus = "pending" | "processing" | "sent" | "failed";

export function OutboxStatusBadge({ status }: { status: OutboxStatus }) {
  switch (status) {
    case "sent":
      return <Badge variant="secondary">Sent</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "processing":
      return <Badge variant="outline">Sending</Badge>;
    case "pending":
      return <Badge variant="outline">Waiting</Badge>;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
