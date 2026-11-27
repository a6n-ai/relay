import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { type MessagesSearch, parseMessagesSearch } from "../../components/messages-search";
import { FilterMenu } from "../../components/page/filter-menu";
import { EmptyState } from "../../components/page/empty-state";
import { LoadMore } from "../../components/page/load-more";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { ResourceTable } from "../../components/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { StatusBadge } from "../../components/status-badge";
import { fetchApps } from "../../console/apps.fns";
import { fetchMessages } from "../../console/messages.fns";
import { formatWhen } from "../../lib/format-date";

export const Route = createFileRoute("/_app/messages")({
  validateSearch: (raw: Record<string, unknown>): MessagesSearch & { offset?: number } => ({
    ...parseMessagesSearch(raw),
    offset: typeof raw.offset === "number" && raw.offset > 0 ? Math.floor(raw.offset) : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps: { appId, offset: _offset, ...rest } }) => {
    const [page, apps] = await Promise.all([fetchMessages({ data: { ...rest, app: appId } }), fetchApps()]);
    return page ? { ...page, apps: apps ?? [] } : null;
  },
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Messages" }, { label: "Sent" }]} columns={4} search filter />,
  component: MessagesPage,
});

type Status = NonNullable<MessagesSearch["status"]>;
const STATUSES: Status[] = ["queued", "sent", "failed", "suppressed"];
const PAGE = 50;

function MessagesPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const navigate = useNavigate({ from: "/messages" });
  const label = search.dir === "in" ? "Received" : "Sent";
  const crumbs = [{ label: "Messages" }, { label }];
  const [email, setEmail] = useUrlFilter("email", { resetCursor: true });

  if (!page) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const filtered = Boolean(search.status || search.email || search.appId);
  const empty =
    page.restricted && search.dir === "in" ? (
      <EmptyState icon={MailIcon} title="No addresses are shared with you yet." description="Ask an owner or admin to share one with you." />
    ) : filtered ? (
      <EmptyState icon={MailIcon} title="No messages match these filters" description="Try a different search or clear the filters." />
    ) : (
      <EmptyState
        icon={MailIcon}
        title="No messages yet"
        description={search.dir === "in" ? "Messages sent to your addresses show up here." : "Messages you send through the API show up here."}
      />
    );
  return (
    <>
      <PageHeader crumbs={crumbs} />
      <Toolbar
        search={
          <SearchInput
            value={email}
            onChange={setEmail}
            placeholder="From or to address"
          />
        }
        filters={
          <FilterMenu
            facets={[
              { key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
              { key: "appId", label: "App", options: page.apps.map((a) => ({ value: a.id, label: a.name })) },
            ]}
            value={search}
            onChange={(next) => navigate({ search: next as never })}
          />
        }
      />
      <ResourceTable
        offset={search.cursor ? search.offset : undefined}
        columns={[
          { header: "When", kind: "time", cell: (m) => formatWhen(m.createdAt) },
          { header: "From / To", secondary: true, cell: (m) => (m.direction === "out" ? m.toEmail : m.fromEmail) ?? "—" },
          { header: "Subject", kind: "name", cell: (m) => m.subject || "(no subject)" },
          { header: "Status", cell: (m) => <StatusBadge status={m.status} direction={m.direction} /> },
        ]}
        rows={page.rows}
        rowKey={(m) => m.id}
        rowHref={(m) => ({ to: "/messages/$messageId", params: { messageId: m.id } })}
        rowLabel={() => "Open message"}
        empty={empty}
      />
      <LoadMore
        hasMore={Boolean(page.nextCursor)}
        to="/messages"
        offset={search.cursor ? search.offset : undefined}
        pageSize={PAGE}
        search={{ ...search, cursor: page.nextCursor }}
        resetTo={search.cursor ? "/messages" : undefined}
        resetSearch={{ ...search, cursor: undefined }}
      />
    </>
  );
}
