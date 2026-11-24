import { Badge } from "@foundry/ui/badge";

const TONE = { pending: "warning", verified: "success", failed: "danger" } as const;
const LABEL = { pending: "Pending", verified: "Verified", failed: "Failed" } as const;

export function StatusBadge({ status }: { status: keyof typeof TONE }) {
  return <Badge variant={TONE[status]}>{LABEL[status]}</Badge>;
}
