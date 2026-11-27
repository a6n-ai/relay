import { canReadApps } from "../../components/lib/scoped-load";
import { Button } from "@foundry/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ListIcon } from "lucide-react";
import { useState } from "react";
import { CONSENT_SHORT } from "../../components/lists/consent-labels";
import { ResourceTable } from "../../components/page/resource-table";
import { FilterMenu } from "../../components/page/filter-menu";
import { ResourceGrid } from "../../components/page/resource-grid";
import { ViewToggle } from "../../components/page/view-toggle";
import { type View, viewPref } from "../../components/page/view-pref";
import { Hint } from "../../components/form/text";
import { useCan } from "../../components/lib/use-can";
import { EmptyState } from "../../components/page/empty-state";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { PageHeader } from "../../components/shell/page-header";
import { fetchLists } from "../../console/lists.fns";
import { str, untyped } from "../../components/lib/route-search";
import { appName, startApp } from "../../shared/scope";
import { loaded, ScopedDenied } from "../../components/page/scoped-page";

type ListsSearch = { appId?: string; q?: string };

export const Route = createFileRoute("/_app/lists")({
  staticData: { title: "Lists", copy: "People you send campaigns to.", scoped: "all" },
  validateSearch: (search: Record<string, unknown>): ListsSearch => ({
    appId: str(search.appId),
    q: str(search.q),
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId }),
  loader: async ({ deps, context }) => {
    if (!canReadApps(context.shell)) return null;
    const apps = context.shell.apps;
    const scoped = deps.appId ? apps.filter((a) => a.id === deps.appId) : apps;
    if (deps.appId && scoped.length === 0) return { missing: true as const };
    const settled = await Promise.allSettled(scoped.map((a) => fetchLists({ data: { appId: a.id } })));
    const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (settled.length > 0 && rejected.length === settled.length) throw rejected[0].reason;
    const results = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (results.some((r) => !r)) return null;
    const lists = results.flatMap((r) => (r && !("missing" in r) ? r : []));
    return { apps, appId: deps.appId, lists, failed: rejected.length };
  },
  pendingComponent: () => <ListSkeleton columns={4} search filter view action />,
  component: ListsPage,
});

function ListsPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const canWrite = useCan({ list: ["write"] });
  const [query, setQuery] = useUrlFilter("q");
  const navigate = useNavigate();
  const [view, setView] = useState<View>(() => viewPref.read("/lists"));
  if (!loaded(page)) return <ScopedDenied page={page} />;
  const { apps, appId, lists, failed } = page;
  const canCreate = canWrite && !!startApp(apps, appId);
  const q = query.trim().toLowerCase();
  const shown = q ? lists.filter((l) => l.name.toLowerCase().includes(q)) : lists;
  const empty = (
    <EmptyState
      icon={ListIcon}
      title={q ? "No lists match" : "No lists yet"}
      description={q ? undefined : "Lists hold the people a campaign sends to."}
      action={
        !q && canCreate ? (
          <Button variant="outline" render={<Link to="/lists/new" search={{ appId }} />}>
            New list
          </Button>
        ) : undefined
      }
    />
  );
  const href = (l: (typeof lists)[number]) => ({ to: "/lists/$listId" as const, params: { listId: l.id }, search: { appId: l.appId } });
  return (
    <>
      <PageHeader />
      <Toolbar
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search lists" />}
        filters={
          apps.length > 1 ? (
            <FilterMenu
              facets={[{ key: "appId", label: "App", options: apps.map((a) => ({ value: a.id, label: a.name })) }]}
              value={search}
              onChange={(next) => void navigate({ to: ".", search: untyped(next) })}
            />
          ) : undefined
        }
        view={<ViewToggle route="/lists" value={view} onChange={setView} />}
      >
        {canCreate ? <Button render={<Link to="/lists/new" search={{ appId }} />}>New list</Button> : null}
      </Toolbar>
      {failed ? <Hint>Lists from some apps could not be loaded. Refresh to try again.</Hint> : null}
      {view === "grid" ? (
        <ResourceGrid
          items={shown}
          rowKey={(l) => l.id}
          href={href}
          rowLabel={() => "Open list"}
          empty={empty}
          card={(l) => (
            <div className="grid gap-1">
              <p className="font-medium">{l.name}</p>
              <Hint size="xs">{appName(apps, l.appId, "—")}</Hint>
              <Hint>
                {l.members} {l.members === 1 ? "contact" : "contacts"} · {CONSENT_SHORT[l.consentSource]}
              </Hint>
            </div>
          )}
        />
      ) : (
        <ResourceTable
          columns={[
            { header: "Name", kind: "name", cell: (l) => l.name },
            { header: "App", secondary: true, cell: (l) => appName(apps, l.appId, "—") },
            { header: "Contacts", cell: (l) => l.members, numeric: true },
            { header: "Consent", secondary: true, cell: (l) => CONSENT_SHORT[l.consentSource] },
          ]}
          rows={shown}
          rowKey={(l) => l.id}
          rowHref={href}
          rowLabel={() => "Open list"}
          empty={empty}
        />
      )}
    </>
  );
}
