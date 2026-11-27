import { Button } from "@foundry/ui/button";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { SendIcon } from "lucide-react";
import { useState } from "react";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { EmptyState } from "../../components/page/empty-state";
import { LoadMore } from "../../components/page/load-more";
import { SettingsCard } from "../../components/page/settings-card";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { CellWhen, ResourceTable } from "../../components/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { runAction } from "../../components/run-action";
import { StatusBadge } from "../../components/status-badge";
import { useCan } from "../../components/use-can";
import { deliveryActions } from "../../components/webhooks/webhook-delivery-actions";
import { WEBHOOK_EVENT_LABELS } from "../../components/webhooks/webhook-events";
import { EditWebhookForm } from "../../components/webhooks/webhook-form";
import { fetchDeliveries, retryDeliveryFn } from "../../console/webhooks.fns";
import { formatDate, formatWhen } from "../../components/lib/format-date";
import { type DeliveryView } from "../../shared/views";
import { hostOf } from "../../components/lib/path";

export const Route = createFileRoute("/_app/apps_/$appId_/webhooks_/$webhookId")({
  loader: ({ params }) => fetchDeliveries({ data: { appId: params.appId, webhookId: params.webhookId } }),
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Apps", to: "/apps" }, { label: "Webhooks" }]} columns={6} card />,
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
  const [editOpen, setEditOpen] = useState(false);
  const appName = shell.apps?.find((a) => a.id === appId)?.name ?? "App";
  const base = [
    { label: "Apps", to: "/apps" },
    { label: appName, to: "/apps/$appId", params: { appId } },
    { label: "Webhooks", to: "/apps/$appId/webhooks", params: { appId } },
  ];

  if (!page) {
    return (
      <>
        <PageHeader crumbs={[...base, { label: "Deliveries" }]} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }

  const rows = [...page.rows, ...(older?.rows ?? [])];
  const nextCursor = older ? older.nextCursor : page.nextCursor;
  const host = hostOf(page.webhook.url);

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
      <PageHeader crumbs={[...base, { label: host }]} />
      <CreateDialog title="Edit webhook" open={editOpen} onOpenChange={setEditOpen}>
        {(done) => (
          <EditWebhookForm
            appId={appId}
            webhook={{ id: webhookId, url: page.webhook.url, events: page.webhook.events }}
            done={done}
          />
        )}
      </CreateDialog>
      <div className="grid gap-4 py-4">
        <div className="px-4">
          <SettingsCard
            title="Webhook"
            description={page.webhook.events.map((e) => WEBHOOK_EVENT_LABELS[e]).join(", ") || undefined}
            footer={page.webhook.enabled ? "Enabled" : "Disabled"}
            action={
              canWrite ? (
                <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
                  Edit webhook
                </Button>
              ) : undefined
            }
          >
            <p className="break-all font-mono text-xs">{page.webhook.url}</p>
          </SettingsCard>
        </div>
        <ResourceTable
          columns={[
            { header: "When", cell: (d) => <CellWhen when={formatDate(d.createdAt)} text={formatWhen(d.createdAt)} /> },
            {
              header: "Message",
              cell: (d) => (
                <Link to="/messages/$messageId" params={{ messageId: d.messageId }} className="font-mono text-xs hover:underline">
                  {d.messageId}
                </Link>
              ),
            },
            { header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
            { header: "Attempts", secondary: true, numeric: true, cell: (d) => d.attempts },
            { header: "Response", secondary: true, numeric: true, cell: (d) => (d.responseStatus === null ? "—" : d.responseStatus) },
            { header: "Last error", secondary: true, cell: (d) => d.lastError ?? "—" },
          ]}
          rows={rows}
          rowKey={(d) => d.id}
          menu={(d) =>
            deliveryActions(d, canWrite, () => {
              setOlder(null);
              void runAction(
                () => retryDeliveryFn({ data: { appId, id: d.id } }),
                "Retry queued",
                () => router.invalidate(),
              );
            })
          }
          empty={
            <EmptyState
              icon={SendIcon}
              title="No deliveries yet"
              description="Each new message that matches this webhook is listed here."
            />
          }
        />
        <LoadMore hasMore={Boolean(nextCursor)} loading={loadingOlder} onMore={loadOlder} />
      </div>
    </>
  );
}
