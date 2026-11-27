import type { ReactNode } from "react";

type Definition = { term: ReactNode; value: ReactNode; note?: ReactNode; wrap?: boolean };

// "details" stacks term and value in two columns; "rows" spreads them across a ruled row, with an optional note under the term.
export function DefinitionList({ items, layout = "details" }: { items: Definition[]; layout?: "details" | "rows" }) {
  if (layout === "rows") {
    return (
      <dl className="grid gap-2 text-sm">
        {items.map((d, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 border-b py-1.5 last:border-b-0">
            <dt>
              {d.term}
              {d.note ? <span className="block text-xs text-muted-foreground">{d.note}</span> : null}
            </dt>
            <dd className="tabular-nums">{d.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map((d, i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{d.term}</dt>
          <dd className={d.wrap ? "break-all" : undefined}>{d.value}</dd>
        </div>
      ))}
    </dl>
  );
}
