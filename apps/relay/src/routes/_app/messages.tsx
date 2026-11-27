import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";
import { PageDenied } from "../../components/page/page-denied";
import { type MessagesSearch, parseMessagesSearch } from "../../components/messages/messages-search";
import { FilterMenu } from "../../components/page/filter-menu";
import { EmptyState } from "../../components/page/empty-state";
import { LoadMore } from "../../components/page/load-more";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { ResourceTable } from "../../components/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { StatusBadge } from "../../components/status-badge";
import { fetchMessages } from "../../console/messages.fns";
import { formatWhen } from "../../components/lib/format-date";
import { MESSAGE_STATUSES } from "../../shared/mail";
import { PAGE_SIZE } from "../../shared/limits";
import { posInt, untyped } from "../../components/lib/route-search";

export const Route = createFileRoute("/_app/messages")({
  staticData: { title: "Messages", copy: "Every email you send and receive, with its delivery status.", scoped: "all" },
  validateSearch: (raw: Record<string, unknown>): MessagesSearch & { offset?: number } => ({
    ...parseMessagesSearch(raw),
    offset: posInt(raw.offset),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps: { appId, offset: _offset, ...rest } }) => fetchMessages({ data: { ...rest, app: appId } }),
  pendingComponent: () => <ListSkeleton columns={4} search filter />,
  component: MessagesPage,
});

type Status = NonNullable<MessagesSearch["status"]>;

function MessagesPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const navigate = useNavigate({ from: "/messages" });
  const [email, setEmail] = useUrlFilter("email", { resetCursor: true });

  if (!page) {
    return <PageDenied />;
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
      <PageHeader />
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
              { key: "status", label: "Status", options: MESSAGE_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
              { key: "appId", label: "App", options: shell.apps.map((a) => ({ value: a.id, label: a.name })) },
            ]}
            value={search}
            onChange={(next) => navigate({ search: untyped(next) })}
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
        pageSize={PAGE_SIZE}
        search={{ ...search, cursor: page.nextCursor }}
        resetTo={search.cursor ? "/messages" : undefined}
        resetSearch={{ ...search, cursor: undefined }}
      />
    </>
  );
}
