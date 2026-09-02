import type { ReactNode } from "react";

/** Create/work on the left, browse on the right. Stacks on small screens. */
export function OperatorSplit({
  create,
  list,
}: {
  create: ReactNode;
  list: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      <div className="lg:sticky lg:top-6 lg:col-span-5">{create}</div>
      <div className="min-w-0 lg:col-span-7">{list}</div>
    </div>
  );
}
