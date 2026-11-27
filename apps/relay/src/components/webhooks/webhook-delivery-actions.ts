import type { RowAction } from "../page/row-menu";

export function deliveryActions(
  row: { status: string; messageId?: string | null },
  canWrite: boolean,
  onRetry?: () => void,
): RowAction[] {
  const actions: RowAction[] = [];
  if (row.messageId) actions.push({ label: "Open message", to: "/messages/$messageId", params: { messageId: row.messageId } });
  actions.push({ label: "Retry", hidden: !(canWrite && row.status === "failed"), onSelect: onRetry });
  return actions;
}
