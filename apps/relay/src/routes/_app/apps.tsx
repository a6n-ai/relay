import { Button } from "@foundry/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BoxesIcon } from "lucide-react";
import { useState } from "react";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { EmptyState } from "../../components/page/empty-state";
import { ResourceGrid } from "../../components/page/resource-grid";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { ViewToggle } from "../../components/page/view-toggle";
import { type View, viewPref } from "../../components/page/view-pref";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { ResourceTable } from "../../components/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { fetchApps } from "../../console/apps.fns";
import { str } from "../../lib/route-search";

export const Route = createFileRoute("/_app/apps")({
  staticData: { title: "Apps", copy: "The products that send mail through Relay." },
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: str(search.q),
  }),
  loader: () => fetchApps(),
  pendingComponent: () => <ListSkeleton columns={3} search view action />,
  component: AppsPage,
});

function AppsPage() {
  const apps = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const canWrite = useCan({ tenant: ["write"] });
  const [query, setQuery] = useUrlFilter("q");
  const [view, setView] = useState<View>(() => viewPref.read(Route.fullPath));
  if (!apps) {
    return (
      <>
        <PageHeader />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const q = query.trim().toLowerCase();
  const rows = q ? apps.filter((a) => a.name.toLowerCase().includes(q)) : apps;
  const create = canWrite ? <Button render={<Link to="/apps/new" />}>New app</Button> : undefined;
  const menu = (a: (typeof apps)[number]) => [
    { label: "Open", to: "/apps/$appId", params: { appId: a.id } },
    { label: "Webhooks", to: "/apps/$appId/webhooks", params: { appId: a.id } },
  ];
  const empty =
    apps.length === 0 ? (
      <EmptyState
        icon={BoxesIcon}
        title="No apps yet"
        description="An app gets its own API keys and senders."
        action={canWrite ? <Button variant="outline" render={<Link to="/apps/new" />}>New app</Button> : undefined}
      />
    ) : (
      <p className="p-4 text-sm text-muted-foreground">No apps match your search.</p>
    );
  return (
    <>
      <PageHeader />
      <Toolbar
        search={apps.length > 0 ? <SearchInput value={query} onChange={setQuery} placeholder="Search apps" /> : undefined}
        view={apps.length > 0 ? <ViewToggle route={Route.fullPath} value={view} onChange={setView} /> : undefined}
      >
        {create}
      </Toolbar>
      {view === "grid" ? (
        <ResourceGrid
          items={rows}
          rowKey={(a) => a.id}
          href={(a) => ({ to: "/apps/$appId", params: { appId: a.id } })}
          rowLabel={(a) => `Open ${a.name}`}
          menu={menu}
          card={(a) => (
            <div className="grid gap-1 pr-8">
              <p className="truncate text-sm font-medium">{a.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{a.slug}</p>
              <p className="text-xs text-muted-foreground">
                {a.keyCount} live {a.keyCount === 1 ? "key" : "keys"}
              </p>
            </div>
          )}
          empty={empty}
        />
      ) : (
        <ResourceTable
          columns={[
            { header: "Name", kind: "name", cell: (a) => a.name },
            { header: "Short name", secondary: true, kind: "mono", cell: (a) => a.slug },
            { header: "Live keys", secondary: true, numeric: true, cell: (a) => a.keyCount },
          ]}
          rows={rows}
          rowKey={(a) => a.id}
          rowHref={(a) => ({ to: "/apps/$appId", params: { appId: a.id } })}
          rowLabel={(a) => `Open ${a.name}`}
          menu={menu}
          empty={empty}
        />
      )}
    </>
  );
}
