import { Button } from "@foundry/ui/button";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { formatWhen } from "../../components/event-timeline";
import { MessagesTabs } from "../../components/messages-tabs";
import { ResourceTable } from "../../components/resource-table";
import { useCan } from "../../components/use-can";
import { ViewHeader } from "../../components/view-header";
import { deleteFailureFn, fetchFailures, replayFailureFn } from "../../console/failures.fns";

export const Route = createFileRoute("/_app/messages_/failures")({
  loader: () => fetchFailures(),
  component: FailuresPage,
});

function FailuresPage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const canManage = useCan({ mailbox: ["manage"] });

  if (!page) {
    return (
      <>
        <ViewHeader title="Failed to receive" />
        <MessagesTabs active="failures" />
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
      toast.error(errorText(err, "Could not retry this letter."));
    }
  }

  async function remove(failureId: string) {
    try {
      await deleteFailureFn({ data: { id: failureId } });
      toast.success("Letter deleted");
      await router.invalidate();
    } catch (err) {
      toast.error(errorText(err, "Could not delete this letter."));
    }
  }

  return (
    <>
      <ViewHeader title="Failed to receive" />
      <MessagesTabs active="failures" />
      <div className="p-4">
        <ResourceTable
          columns={[
            { header: "Received", cell: (f) => <span className="text-xs tabular-nums">{formatWhen(f.receivedAt)}</span> },
            { header: "From", cell: (f) => f.envelopeFrom ?? "Unknown" },
            { header: "To", cell: (f) => f.envelopeTo },
            { header: "Error", cell: (f) => f.error },
            { header: "Attempts", cell: (f) => <span className="tabular-nums">{f.attempts}</span> },
            {
              header: "",
              cell: (f) => {
                if (!canManage) return null;
                return (
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => retry(f.id)}>
                      Retry
                    </Button>
                    <ConfirmDialog
                      trigger="Delete"
                      title="Delete this letter?"
                      description="The letter is removed and will not be retried."
                      confirmLabel="Delete"
                      onConfirm={() => remove(f.id)}
                    />
                  </div>
                );
              },
            },
          ]}
          rows={page.rows}
          rowKey={(f) => f.id}
          empty="Nothing failed to arrive."
        />
      </div>
    </>
  );
}
