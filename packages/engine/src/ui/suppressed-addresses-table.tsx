"use client";

import { ShieldOffIcon } from "lucide-react";
import { DataTable, type Column } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";

export interface SuppressionRow {
  at: number;
  address: string;
  scope: string;
  reason: string;
}

const COLUMNS: readonly Column<"time" | "address" | "scope" | "reason">[] = [
  { key: "time", label: "Time" },
  { key: "address", label: "Address" },
  { key: "scope", label: "Scope" },
  { key: "reason", label: "Reason" },
];

/**
 * Bounced/complained/unsubscribed addresses — shown under the Logs page in
 * every app. Fixed to the most recent rows (no search/sort/pagination props):
 * the Notification log DataTable above it already owns the shared `q`/`page`
 * URL params on that route.
 */
export function SuppressedAddressesTable({
  rows,
  formatTime = (at) => new Date(at).toLocaleString(),
}: {
  rows: SuppressionRow[];
  /** Defaults to the browser's locale/timezone; pass one to render in the app's configured timezone instead. */
  formatTime?: (at: number) => string;
}) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => `${r.address}-${r.at}`}
      serial={false}
      emptyIcon={ShieldOffIcon}
      emptyMessage="No suppressed addresses."
      renderRow={(r) => (
        <>
          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatTime(r.at)}</TableCell>
          <TableCell className="text-sm">{r.address}</TableCell>
          <TableCell>
            <Badge variant={r.scope === "all" ? "destructive" : "outline"}>{r.scope}</Badge>
          </TableCell>
          <TableCell className="text-sm text-muted-foreground">{r.reason}</TableCell>
        </>
      )}
    />
  );
}

export function SuppressedAddressesTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
