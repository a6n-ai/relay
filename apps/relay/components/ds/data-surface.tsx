import type { ReactNode } from "react";

/** One hairline surface for tables so Sends and Team share the same frame. */
export function DataSurface({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto border border-border bg-card">{children}</div>
  );
}
