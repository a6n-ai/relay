import type { ReactNode } from "react";

export function TableInset({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-4 in-data-[slot=card-content]:p-0">{children}</div>;
}
