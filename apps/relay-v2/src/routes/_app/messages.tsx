import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { AppSelect } from "../../components/app-select";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { formatWhen } from "../../components/event-timeline";
import { MessagesTabs } from "../../components/messages-tabs";
import { type MessagesSearch, parseMessagesSearch } from "../../components/messages-search";
import { ResourceTable } from "../../components/resource-table";
import { StatusBadge } from "../../components/status-badge";
import { ViewHeader } from "../../components/view-header";
import { fetchApps } from "../../console/apps.fns";
import { fetchMessages } from "../../console/messages.fns";

export const Route = createFileRoute("/_app/messages")({
  validateSearch: parseMessagesSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => Promise.all([fetchMessages({ data: deps }), fetchApps()]),
  component: MessagesPage,
});

type Status = NonNullable<MessagesSearch["status"]>;
const STATUSES: Status[] = ["queued", "sent", "failed", "suppressed"];

function MessagesPage() {
  const [page, apps] = Route.useLoaderData();
  const search = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const tab = search.dir === "in" ? "received" : "sent";
  if (!page) {
    return (
      <>
        <ViewHeader title="Messages" />
        <MessagesTabs active={tab} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  return (
    <>
      <ViewHeader title="Messages" />
      <MessagesTabs active={tab} />
      <div className="grid gap-4 p-4">
        <Filters key={search.dir} search={search} apps={apps ?? []} />
        <ResourceTable
          columns={[
            { header: "When", cell: (m) => <span className="text-xs tabular-nums">{formatWhen(m.createdAt)}</span> },
            { header: "From / To", cell: (m) => (m.direction === "out" ? m.toEmail : m.fromEmail) ?? "-" },
            {
              header: "Subject",
              cell: (m) => (
                <Link to="/messages/$messageId" params={{ messageId: m.id }} className="font-medium hover:underline">
                  {m.subject || "(no subject)"}
                </Link>
              ),
            },
            { header: "Status", cell: (m) => <StatusBadge status={m.status} direction={m.direction} /> },
          ]}
          rows={page.rows}
          rowKey={(m) => m.id}
          empty={page.restricted && search.dir === "in" ? "No addresses are shared with you yet." : "No messages match these filters."}
        />
        <nav aria-label="Pages" className="flex justify-between text-sm">
          <Link to="/messages" search={{ ...search, cursor: undefined }} className="hover:underline">
            Newer
          </Link>
          {page.nextCursor ? (
            <Link to="/messages" search={{ ...search, cursor: page.nextCursor }} className="hover:underline">
              Older
            </Link>
          ) : null}
        </nav>
      </div>
    </>
  );
}

// Filters apply by navigating with new search params, so the list reloads from the server.
function Filters({ search, apps }: { search: MessagesSearch; apps: { id: string; name: string }[] }) {
  const navigate = useNavigate({ from: "/messages" });
  const [app, setApp] = useState(search.app ?? "all");
  const [status, setStatus] = useState<Status | "all">(search.status ?? "all");
  const [email, setEmail] = useState(search.email ?? "");

  function apply(event: FormEvent) {
    event.preventDefault();
    navigate({
      to: "/messages",
      search: {
        dir: search.dir,
        app: app === "all" ? undefined : app,
        status: status === "all" ? undefined : status,
        email: email.trim() || undefined,
      },
    });
  }

  return (
    <form onSubmit={apply} className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor="msg-app">App</Label>
        <AppSelect apps={apps} value={app} onValueChange={setApp} id="msg-app" allLabel="All apps" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="msg-status">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as Status | "all")}>
          <SelectTrigger id="msg-status" className="w-full">
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
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="msg-email">{search.dir === "out" ? "To address" : "From address"}</Label>
        <Input id="msg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Button type="submit">Filter</Button>
    </form>
  );
}
