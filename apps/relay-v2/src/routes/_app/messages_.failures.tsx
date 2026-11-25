import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { PageHeader } from "../../components/shell/page-header";
import { formatWhen } from "../../lib/format-date";
import { ResourceTable } from "../../components/resource-table";
import { useCan } from "../../components/use-can";
import { deleteFailureFn, fetchFailures, replayFailureFn } from "../../console/failures.fns";

export const Route = createFileRoute("/_app/messages_/failures")({
  loader: () => fetchFailures(),
  pendingComponent: () => <TableSkeleton columns={5} />,
  component: FailuresPage,
});

function FailuresPage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const canManage = useCan({ mailbox: ["manage"] });
  const [deleting, setDeleting] = useState<string | null>(null);
  const crumbs = [{ label: "Messages" }, { label: "Failed to receive" }];

  if (!page) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }

  async function retry(failureId: string) {
    try {
      const result = await replayFailureFn({ data: { id: failureId } });
      if (result.outcome === "inserted") {
        toast.success("Delivered to the inbox", {
          description: (
            <Link to="/messages/$messageId" params={{ messageId: result.messageId }} className="underline">
              Open message
            </Link>
          ),
        });
      } else if (result.outcome === "duplicate") {
        toast("Already in the inbox");
      } else {
        toast.error(result.error);
      }
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not retry this message."));
    }
  }

  async function remove(failureId: string) {
    try {
      await deleteFailureFn({ data: { id: failureId } });
      toast.success("Message deleted");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not delete this message."));
    }
  }

  return (
    <>
      <PageHeader crumbs={crumbs} />
      <ResourceTable
        columns={[
          { header: "Received", cell: (f) => <span className="text-xs tabular-nums">{formatWhen(f.receivedAt)}</span> },
          { header: "From", cell: (f) => f.envelopeFrom ?? "Unknown" },
          { header: "To", cell: (f) => f.envelopeTo },
          { header: "Error", cell: (f) => f.error },
          { header: "Attempts", numeric: true, cell: (f) => f.attempts },
        ]}
        rows={page.rows}
        rowKey={(f) => f.id}
        empty="Nothing failed to arrive."
        menu={(f) => [
          { label: "Retry", onSelect: () => retry(f.id), hidden: !canManage },
          { label: "Delete", onSelect: () => setDeleting(f.id), destructive: true, hidden: !canManage },
        ]}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this message?"
        description="The message is removed and will not be retried."
        confirmLabel="Delete"
        onConfirm={() => deleting && remove(deleting)}
      />
    </>
  );
}
