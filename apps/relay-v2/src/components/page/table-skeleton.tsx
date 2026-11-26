import { Skeleton } from "@foundry/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@foundry/ui/table";
import { TableInset } from "./table-inset";

export function TableSkeleton({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <TableInset>
      <Table role="status" aria-label="Loading">
        <TableBody>
          {Array.from({ length: rows }, (_, r) => (
            <TableRow key={r}>
              {Array.from({ length: columns }, (_, c) => (
                <TableCell key={c}>
                  <Skeleton className={c === 0 ? "h-4 w-1/3" : "h-4 w-full"} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableInset>
  );
}
