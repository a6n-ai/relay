import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { type MessagesSearch, parseMessagesSearch } from "../../components/messages-search";
import { EmptyState } from "../../components/page/empty-state";
import { LoadMore } from "../../components/page/load-more";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { ResourceTable } from "../../components/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { StatusBadge } from "../../components/status-badge";
import { fetchMessages } from "../../console/messages.fns";
import { formatWhen } from "../../lib/format-date";

export const Route = createFileRoute("/_app/messages")({
  validateSearch: parseMessagesSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps: { appId, ...rest } }) => fetchMessages({ data: { ...rest, app: appId } }),
  pendingComponent: () => <TableSkeleton columns={4} />,
  component: MessagesPage,
});

type Status = NonNullable<MessagesSearch["status"]>;
const STATUSES: Status[] = ["queued", "sent", "failed", "suppressed"];

function MessagesPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const navigate = useNavigate({ from: "/messages" });
  const label = search.dir === "in" ? "Received" : "Sent";
  const crumbs = [{ label: "Messages" }, { label }];
  const [email, setEmail] = useState(search.email ?? "");

  // Filters live in the URL; the address applies 300 ms after typing stops.
  useEffect(() => {
    const next = email.trim() || undefined;
    if (next === search.email) return;
    const t = setTimeout(() => navigate({ search: (s) => ({ ...s, email: next, cursor: undefined }) }), 300);
    return () => clearTimeout(t);
  }, [email, search.email, navigate]);

  if (!page) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const filtered = Boolean(search.status || search.email);
  const empty =
    page.restricted && search.dir === "in" ? (
      <EmptyState icon={MailIcon} title="No addresses are shared with you yet" />
    ) : filtered ? (
      <EmptyState icon={MailIcon} title="No messages match these filters" />
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
            placeholder={search.dir === "out" ? "To address" : "From address"}
          />
        }
        filters={
          <Select
            value={search.status ?? "all"}
            onValueChange={(v) =>
              navigate({ search: (s) => ({ ...s, status: v === "all" ? undefined : (v as Status), cursor: undefined }) })
            }
          >
            <SelectTrigger aria-label="Status" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <ResourceTable
        columns={[
          { header: "When", cell: (m) => <span className="text-xs tabular-nums">{formatWhen(m.createdAt)}</span> },
          { header: "From / To", cell: (m) => (m.direction === "out" ? m.toEmail : m.fromEmail) ?? "—" },
          { header: "Subject", cell: (m) => <span className="font-medium">{m.subject || "(no subject)"}</span> },
          { header: "Status", cell: (m) => <StatusBadge status={m.status} direction={m.direction} /> },
        ]}
        rows={page.rows}
        rowKey={(m) => m.id}
        rowHref={(m) => ({ to: "/messages/$messageId", params: { messageId: m.id } })}
        rowLabel={() => "Open message"}
        empty={empty}
      />
      <LoadMore hasMore={Boolean(page.nextCursor)} to="/messages" search={{ ...search, cursor: page.nextCursor }} />
    </>
  );
}
