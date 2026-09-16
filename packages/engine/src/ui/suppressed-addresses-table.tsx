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
  timeZone,
}: {
  rows: SuppressionRow[];
  /**
   * A plain string, not a formatter function — this is a Client Component
   * usually rendered from a Server Component page, and a function prop can't
   * cross that boundary (RSC can't serialize it, so the page fails to
   * render). Omit to fall back to the browser's own locale/timezone.
   */
  timeZone?: string;
}) {
  const formatTime = (at: number) =>
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(at);
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
