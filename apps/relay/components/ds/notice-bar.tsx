import type { ReactNode } from "react";
import { Panel } from "./panel";

/** One line of text with trailing actions, on a Panel. The caller passes the buttons or links. */
export function NoticeBar({ message, actions }: { message: ReactNode; actions?: ReactNode }) {
  return (
    <Panel role="status" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 text-sm">{message}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </Panel>
  );
}
