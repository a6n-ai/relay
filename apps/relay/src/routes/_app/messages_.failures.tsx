import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { confirmAction } from "../../components/lib/run-action";
import { ConfirmDialog } from "../../components/page/confirm-dialog";
import { PageDenied } from "../../components/page/page-denied";
import { errorText } from "../../components/lib/error-text";
import { FilterMenu } from "../../components/page/filter-menu";
import { LoadMore } from "../../components/page/load-more";
import { Hint } from "../../components/form/text";
import { Toolbar } from "../../components/page/toolbar";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { PageHeader } from "../../components/shell/page-header";
import { formatWhen } from "../../components/lib/format-date";
import { ResourceTable } from "../../components/page/resource-table";
import { useCan } from "../../components/lib/use-can";
import { deleteFailureFn, fetchFailures, replayFailureFn } from "../../console/failures.fns";
import { posInt, str, untyped } from "../../components/lib/route-search";

type FailuresSearch = { appId?: string; offset?: number };

// shortcut: the server returns the newest 100 failures at once, so paging is over the loaded rows. Add a cursor if it grows.
const PAGE = 25;

export const Route = createFileRoute("/_app/messages_/failures")({
  staticData: { title: "Failed", copy: "Messages that reached Relay but could not be accepted." },
  validateSearch: (raw: Record<string, unknown>): FailuresSearch => ({
    appId: str(raw.appId),
    offset: posInt(raw.offset),
  }),
  loader: () => fetchFailures(),
  pendingComponent: () => <ListSkeleton columns={5} filter />,
  component: FailuresPage,
});

function FailuresPage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/messages/failures" });
  const canManage = useCan({ mailbox: ["manage"] });
  const [deleting, setDeleting] = useState<string | null>(null);

  if (!page) {
    return <PageDenied />;
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
    await confirmAction(() => deleteFailureFn({ data: { id: failureId } }), "Message deleted", () => router.invalidate());
  }

  const offset = search.offset ?? 0;
  const matching = page.rows.filter((f) => !search.appId || f.appId === search.appId);
  const rows = matching.slice(offset, offset + PAGE);
  const target = page.rows.find((f) => f.id === deleting);
  return (
    <>
      <PageHeader />
      <Toolbar
        filters={
          <FilterMenu
            facets={[{ key: "appId", label: "App", options: shell.apps.map((a) => ({ value: a.id, label: a.name })) }]}
            value={search}
            onChange={(next) => navigate({ search: untyped(next), replace: true })}
          />
        }
      />
      {page.rows.length >= 100 ? (
        <Hint>Showing the newest 100 failed messages. The App filter applies to those.</Hint>
      ) : null}
      <ResourceTable
        offset={offset}
        columns={[
          { header: "Received", kind: "time", cell: (f) => formatWhen(f.receivedAt) },
          { header: "From", secondary: true, cell: (f) => f.envelopeFrom ?? "—" },
          { header: "To", cell: (f) => f.envelopeTo },
          { header: "Error", cell: (f) => f.error },
          { header: "Attempts", secondary: true, numeric: true, cell: (f) => f.attempts },
        ]}
        rows={rows}
        rowKey={(f) => f.id}
        empty={page.rows.length === 0 ? "Nothing failed to arrive." : "No failed messages match."}
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
        title={target ? `Delete the message to ${target.envelopeTo}?` : "Delete this message?"}
        description="The message is removed and will not be retried."
        confirmLabel="Delete message"
        onConfirm={async () => {
          if (deleting) await remove(deleting);
        }}
      />
      <LoadMore
        hasMore={matching.length > offset + PAGE}
        to="/messages/failures"
        offset={offset}
        pageSize={PAGE}
        search={{ appId: search.appId }}
        resetTo={offset > 0 ? "/messages/failures" : undefined}
        resetSearch={{ appId: search.appId }}
      />
    </>
  );
}
