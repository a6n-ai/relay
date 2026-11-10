import type { ReactNode } from "react";
import { CreateDialog } from "./create-dialog";

/**
 * Collection pages (createLabel given): the list takes the full view and "New …" opens the create
 * form in a dialog, like Linear. Detail pages (no createLabel): the edit form sits beside the content.
 */
export function OperatorSplit({
  create,
  list,
  createLabel,
}: {
  create: ReactNode;
  list: ReactNode;
  createLabel?: string;
}) {
  if (createLabel) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <CreateDialog label={createLabel}>{create}</CreateDialog>
        </div>
        <div className="min-w-0">{list}</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-8">{list}</div>
      <div className="lg:sticky lg:top-6 lg:col-span-4">{create}</div>
    </div>
  );
}
