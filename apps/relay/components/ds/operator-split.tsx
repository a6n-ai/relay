import type { ReactNode } from "react";

/**
 * Detail pages: the content sits on the left and the edit panel beside it. (Collection pages put
 * "New …" in the view header as a CreateDialog and show only the list.)
 */
export function OperatorSplit({ create, list }: { create: ReactNode; list: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-8">{list}</div>
      <div className="lg:sticky lg:top-6 lg:col-span-4">{create}</div>
    </div>
  );
}
