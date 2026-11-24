import { Button } from "@foundry/ui/button";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { formatWhen } from "../../components/event-timeline";
import { ResourceTable } from "../../components/resource-table";
import { runAction } from "../../components/run-action";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { ViewHeader } from "../../components/view-header";
import { fetchDeliveries, retryDeliveryFn } from "../../console/webhooks.fns";
import type { DeliveryView } from "../../do/console-reads";

export const Route = createFileRoute("/_app/apps_/$appId_/webhooks_/$webhookId")({
  loader: ({ params }) => fetchDeliveries({ data: { appId: params.appId, webhookId: params.webhookId } }),
  component: DeliveriesPage,
});

type Page = { rows: DeliveryView[]; nextCursor: string | null };

function DeliveriesPage() {
  const page = Route.useLoaderData();
  const { appId, webhookId } = Route.useParams();
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const canWrite = useCan({ webhook: ["write"] });
  const [older, setOlder] = useState<Page | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  if (!page) {
    return (
      <>
        <ViewHeader title="Deliveries" />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }

  const rows = [...page.rows, ...(older?.rows ?? [])];
  const nextCursor = older ? older.nextCursor : page.nextCursor;

  async function loadOlder() {
    if (!nextCursor) return;
    setLoadingOlder(true);
    try {
      const next = await fetchDeliveries({ data: { appId, webhookId, cursor: nextCursor } });
      if (next) setOlder({ rows: [...(older?.rows ?? []), ...next.rows], nextCursor: next.nextCursor });
    } catch (err) {
      toast.error(errorText(err, "Could not load older deliveries."));
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <>
      <ViewHeader title="Deliveries" />
      <div className="grid gap-4 p-4">
        <p className="break-all font-mono text-xs text-muted-foreground">{page.webhook.url}</p>
        <ResourceTable
          columns={[
            { header: "When", cell: (d) => <span className="text-xs tabular-nums">{formatWhen(d.createdAt)}</span> },
            {
              header: "Message",
              cell: (d) => (
                <Link to="/messages/$messageId" params={{ messageId: d.messageId }} className="font-mono text-xs underline">
                  {d.messageId}
                </Link>
              ),
            },
            { header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
            { header: "Attempts", cell: (d) => <span className="tabular-nums">{d.attempts}</span> },
            { header: "Response", cell: (d) => (d.responseStatus === null ? "-" : <span className="tabular-nums">{d.responseStatus}</span>) },
            { header: "Last error", cell: (d) => d.lastError ?? "-" },
            {
              header: "",
              cell: (d) =>
                canWrite && d.status === "failed" ? (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setOlder(null);
                        void runAction(
                          () => retryDeliveryFn({ data: { appId, id: d.id } }),
                          "Retry queued",
                          () => router.invalidate(),
                        );
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                ) : null,
            },
          ]}
          rows={rows}
          rowKey={(d) => d.id}
          empty="No deliveries yet. Each new letter that matches this webhook is listed here."
        />
        {nextCursor ? (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder}>
              Older
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
