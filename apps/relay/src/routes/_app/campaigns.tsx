import { Button } from "@foundry/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import MegaphoneIcon from "lucide-react/icons/megaphone";
import { useState } from "react";
import { EmptyState } from "../../components/page/empty-state";
import { PageLocalHint } from "../../components/page/page-local-hint";
import { FilterMenu } from "../../components/page/filter-menu";
import { ResourceCard, ResourceGrid } from "../../components/page/resource-grid";
import { ViewToggle } from "../../components/page/view-toggle";
import { type View, viewPref } from "../../components/page/view-pref";
import { LoadMore } from "../../components/page/load-more";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ResourceTable } from "../../components/page/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { StatusBadge } from "../../components/page/status-badge";
import { useCan } from "../../components/lib/use-can";
import { fetchCampaigns } from "../../console/campaigns.fns";
import { formatWhen } from "../../components/lib/format-date";
import { PAGE_SIZE } from "../../shared/limits";
import { posInt, str, untyped } from "../../components/lib/route-search";
import { loaded, ScopedDenied } from "../../components/page/scoped-page";
import { scopedLoad } from "../../components/lib/scoped-load";

type CampaignsSearch = { appId?: string; cursor?: string; offset?: number; q?: string; status?: string };

const ROUTE = "/campaigns";

export const Route = createFileRoute("/_app/campaigns")({
  staticData: { title: "Campaigns", copy: "Emails you send to a list, on a schedule or on demand.", scoped: "first" },
  validateSearch: (search: Record<string, unknown>): CampaignsSearch => ({
    appId: str(search.appId),
    cursor: str(search.cursor),
    offset: posInt(search.offset),
    q: str(search.q),
    status: str(search.status),
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId, cursor: search.cursor }),
  pendingComponent: () => <ListSkeleton columns={5} search filter view action />,
  loader: ({ deps, context }) =>
    scopedLoad(deps.appId, context.shell.apps, async (appId) => {
      const campaigns = await fetchCampaigns({ data: { appId, cursor: deps.cursor } });
      return campaigns && { campaigns };
    }, {
      campaigns: { rows: [], nextCursor: null },
    }),
  component: CampaignsPage,
});


function CampaignsPage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const search = Route.useSearch();
  const canWrite = useCan({ campaign: ["write"] });
  const [query, setQuery] = useUrlFilter("q");
  const navigate = useNavigate({ from: "/campaigns" });
  const [view, setView] = useState<View>(() => viewPref.read(ROUTE));
  if (!loaded(page)) return <ScopedDenied page={page} />;
  const { apps, appId, campaigns } = page;
  const empty =
    campaigns.rows.length === 0 ? (
      <EmptyState icon={MegaphoneIcon} title="No campaigns yet" description="A campaign sends one message to everyone on a list." action={canWrite && appId ? <Button variant="outline" render={<Link to="/campaigns/new" search={{ appId: search.appId }} />}>New campaign</Button> : undefined} />
    ) : (
      search.status && campaigns.nextCursor ? "None on this page" : "No campaigns match."
    );
  const newButton = canWrite && appId ? <Button render={<Link to="/campaigns/new" search={{ appId: search.appId }} />}>New campaign</Button> : null;
  const q = query.trim().toLowerCase();
  const rows = campaigns.rows.filter((c) => (!search.status || c.status === search.status) && (!q || c.name.toLowerCase().includes(q)));
  const facets = [
    { key: "status", label: "Status", options: [...new Set(campaigns.rows.map((c) => c.status))].map((s) => ({ value: s, label: `${s[0]?.toUpperCase()}${s.slice(1)}` })) },
    { key: "appId", label: "App", options: apps.map((a) => ({ value: a.id, label: a.name })) },
  ];
  const showApp = !search.appId;
  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? "—";
  const when = (c: (typeof rows)[number]) => {
    const at = c.finishedAt ?? c.scheduledAt;
    return at ? formatWhen(at) : "—";
  };
  const openRow = (c: (typeof rows)[number]) => ({ to: "/campaigns/$campaignId" as const, params: { campaignId: c.id }, search: { appId: c.appId } });
  return (
    <>
      <PageHeader />
      <Toolbar
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search campaigns" />}
        filters={<FilterMenu facets={facets} value={search} onChange={(next) => navigate({ search: untyped(next), replace: true })} />}
        view={<ViewToggle route={ROUTE} value={view} onChange={setView} />}
      >
        {newButton}
      </Toolbar>
      <PageLocalHint active={Boolean(search.status)} hasMore={Boolean(campaigns.nextCursor)} />
      {view === "grid" ? (
        <ResourceGrid
          items={rows}
          rowKey={(c) => c.id}
          href={openRow}
          rowLabel={(c) => `Open ${c.name}`}
          menu={(c) => [{ label: "Open", ...openRow(c) }]}
          empty={empty}
          card={(c) => (
            <ResourceCard
              title={c.name}
              badge={<StatusBadge status={c.status} />}
              hints={[showApp && appName(c.appId), `${when(c)} · ${c.recipients} recipients`]}
            />
          )}
        />
      ) : (
        <ResourceTable
          offset={search.cursor ? search.offset : undefined}
          columns={[
            { header: "Name", kind: "name", cell: (c) => c.name },
            { header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
            ...(showApp ? [{ header: "App", cell: (c: (typeof rows)[number]) => appName(c.appId) }] : []),
            { header: "Scheduled or sent", secondary: true, cell: when },
            { header: "Recipients", secondary: true, numeric: true, cell: (c) => c.recipients },
          ]}
          rows={rows}
          rowKey={(c) => c.id}
          rowHref={openRow}
          rowLabel={(c) => `Open ${c.name}`}
          menu={(c) => [{ label: "Open", ...openRow(c) }]}
          empty={empty}
        />
      )}
      <LoadMore
        hasMore={Boolean(campaigns.nextCursor)}
        to="/campaigns"
        offset={search.cursor ? search.offset : undefined}
        pageSize={PAGE_SIZE}
        search={{ appId: search.appId, q: search.q, status: search.status, cursor: campaigns.nextCursor }}
        resetTo={search.cursor ? "/campaigns" : undefined}
        resetSearch={{ appId: search.appId, q: search.q, status: search.status }}
      />
    </>
  );
}
