import { Skeleton } from "@foundry/ui/skeleton";

export function TableSkeleton({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <div className="px-4 pb-4 in-data-[slot=card-content]:p-0">
    <div className="divide-y" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={c === 0 ? "h-4 w-1/3" : "h-4 flex-1"} />
          ))}
        </div>
      ))}
    </div>
    </div>
  );
}
