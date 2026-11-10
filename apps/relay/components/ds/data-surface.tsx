import type { ReactNode } from "react";
import { Panel } from "./panel";

/** Tables (Sends, Team) scroll sideways inside one Panel. */
export function DataSurface({ children }: { children: ReactNode }) {
  return <Panel className="overflow-x-auto">{children}</Panel>;
}
