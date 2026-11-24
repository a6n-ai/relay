import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import type { ReactNode } from "react";

export type Column<T> = { header: string; cell: (row: T) => ReactNode };

export function ResourceTable<T>({
  columns,
  rows,
  rowKey,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: string;
}) {
  if (rows.length === 0) return <p className="p-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.header}>{c.header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={rowKey(row)}>
            {columns.map((c) => (
              <TableCell key={c.header}>{c.cell(row)}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
