import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { RowMenu, type RowAction } from "./page/row-menu";

export type Column<T> = { header: string; cell: (row: T) => ReactNode; numeric?: boolean };

export function CellWhen({ when, text }: { when: string; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="tabular-nums" />}>{text}</TooltipTrigger>
      <TooltipContent>{when}</TooltipContent>
    </Tooltip>
  );
}

export function ResourceTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  rowHref,
  rowLabel,
  menu,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: ReactNode;
  rowHref?: (row: T) => LinkProps;
  rowLabel?: (row: T) => string;
  menu?: (row: T) => RowAction[];
}) {
  if (rows.length === 0) return typeof empty === "string" ? <p className="p-4 text-sm text-muted-foreground">{empty}</p> : <>{empty}</>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.header} className={c.numeric ? "text-right tabular-nums" : undefined}>
              {c.header}
            </TableHead>
          ))}
          {menu ? <TableHead className="w-10" /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const href = rowHref?.(row);
          return (
            <TableRow key={rowKey(row)} className={href ? "relative hover:bg-muted/50 [&_td>:not([data-row-link])]:relative [&_td>:not([data-row-link])]:z-10" : undefined}>
              {columns.map((c, i) => (
                <TableCell key={c.header} className={c.numeric ? "text-right tabular-nums" : undefined}>
                  {c.cell(row)}
                  {href && i === 0 ? (
                    <Link
                      {...href}
                      data-row-link
                      aria-label={rowLabel?.(row) ?? "Open"}
                      className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    />
                  ) : null}
                </TableCell>
              ))}
              {menu ? (
                <TableCell className="w-10 text-right">
                  <RowMenu actions={menu(row)} label="Row actions" />
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
