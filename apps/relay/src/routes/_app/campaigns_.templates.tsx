import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import FileTextIcon from "lucide-react/icons/file-text";
import { useState } from "react";
import { EmptyState } from "../../components/page/empty-state";
import { PageLocalHint } from "../../components/page/page-local-hint";
import { FilterMenu } from "../../components/page/filter-menu";
import { ResourceCard, ResourceGrid } from "../../components/page/resource-grid";
import { type View, viewPref } from "../../components/page/view-pref";
import { ViewToggle } from "../../components/page/view-toggle";
import { LoadMore } from "../../components/page/load-more";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ResourceTable } from "../../components/page/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/lib/use-can";
import { fetchTemplates } from "../../console/templates.fns";
import { formatWhen } from "../../components/lib/format-date";
import { PAGE_SIZE } from "../../shared/limits";
import { posInt, str, untyped } from "../../components/lib/route-search";
import { loaded, ScopedDenied } from "../../components/page/scoped-page";
import { scopedLoad } from "../../components/lib/scoped-load";

type TemplatesSearch = { appId?: string; cursor?: string; offset?: number; q?: string; event?: string; locale?: string };

const ROUTE = "/campaigns/templates";
const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/_app/campaigns_/templates")({
  staticData: { title: "Templates", copy: "Reusable layouts for your campaigns and app emails.", scoped: "first" },
  validateSearch: (search: Record<string, unknown>): TemplatesSearch => ({
    appId: str(search.appId),
    cursor: str(search.cursor),
    offset: posInt(search.offset),
    event: text(search.event),
    locale: text(search.locale),
    q: str(search.q),
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId, cursor: search.cursor }),
  pendingComponent: () => <ListSkeleton columns={5} search filter view action />,
  loader: ({ deps, context }) =>
    scopedLoad(deps.appId, context.shell, async (appId) => {
      const templates = await fetchTemplates({ data: { appId, cursor: deps.cursor } });
      return templates && { templates };
    }, {
      templates: { rows: [], nextCursor: null },
    }),
  component: TemplatesPage,
});


function TemplatesPage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const search = Route.useSearch();
  const canWrite = useCan({ template: ["write"] });
  const [query, setQuery] = useUrlFilter("q");
  const navigate = useNavigate({ from: "/campaigns/templates" });
  const [view, setView] = useState<View>(() => viewPref.read(ROUTE));
  if (!loaded(page)) return <ScopedDenied page={page} />;
  const { apps, appId, templates } = page;
  const canCreate = canWrite && Boolean(appId);
  const newButton = canCreate ? <Button render={<Link to="/campaigns/templates/new" search={{ appId: search.appId }} />}>New template</Button> : null;
  const q = query.trim().toLowerCase();
  const rows = templates.rows.filter(
    (t) => (!q || t.name.toLowerCase().includes(q)) && (!search.event || t.event === search.event) && (!search.locale || t.locale === search.locale),
  );
  const distinct = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))].map((v) => ({ value: v, label: v }));
  const facets = [
    { key: "event", label: "Event", options: distinct(templates.rows.map((t) => t.event)) },
    { key: "locale", label: "Locale", options: distinct(templates.rows.map((t) => t.locale)) },
  ];
  const showApp = !search.appId;
  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? "—";
  const openRow = (t: (typeof rows)[number]) => ({ to: "/campaigns/templates/$templateId" as const, params: { templateId: t.id }, search: { appId: t.appId } });
  const empty =
    templates.rows.length === 0 ? (
      <EmptyState
        icon={FileTextIcon}
        title="No templates yet"
        description="Templates are reusable email content."
        action={canCreate ? <Button variant="outline" render={<Link to="/campaigns/templates/new" search={{ appId: search.appId }} />}>New template</Button> : undefined}
      />
    ) : (
      (search.event || search.locale) && templates.nextCursor ? "None on this page" : "No templates match."
    );
  return (
    <>
      <PageHeader />
      <Toolbar
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search templates" />}
        filters={<FilterMenu facets={facets} value={search} onChange={(next) => navigate({ search: untyped(next), replace: true })} />}
        view={<ViewToggle route={ROUTE} value={view} onChange={setView} />}
      >
        {newButton}
      </Toolbar>
      <PageLocalHint active={Boolean(search.event || search.locale)} hasMore={Boolean(templates.nextCursor)} />
      {view === "grid" ? (
        <ResourceGrid
          items={rows}
          rowKey={(t) => t.id}
          href={openRow}
          rowLabel={(t) => `Open ${t.name}`}
          menu={(t) => [{ label: "Open", ...openRow(t) }]}
          empty={empty}
          card={(t) => (
            <ResourceCard
              title={t.name}
              badge={<Badge variant={t.enabled ? "secondary" : "outline"}>{t.enabled ? "On" : "Off"}</Badge>}
              hints={[showApp && appName(t.appId), `${t.event ?? "No event"} · ${t.locale}`, `Updated ${formatWhen(t.updatedAt)}`]}
            />
          )}
        />
      ) : (
        <ResourceTable
          offset={search.cursor ? search.offset : undefined}
          columns={[
            { header: "Name", kind: "name", cell: (t) => t.name },
            ...(showApp ? [{ header: "App", cell: (t: (typeof rows)[number]) => appName(t.appId) }] : []),
            { header: "Event", secondary: true, cell: (t) => t.event ?? "—" },
            { header: "Enabled", cell: (t) => <Badge variant={t.enabled ? "secondary" : "outline"}>{t.enabled ? "On" : "Off"}</Badge> },
            { header: "Updated", secondary: true, cell: (t) => <span className="tabular-nums">{formatWhen(t.updatedAt)}</span> },
          ]}
          rows={rows}
          rowKey={(t) => t.id}
          rowHref={openRow}
          rowLabel={(t) => `Open ${t.name}`}
          menu={(t) => [{ label: "Open", ...openRow(t) }]}
          empty={empty}
        />
      )}
      <LoadMore
        hasMore={Boolean(templates.nextCursor)}
        to="/campaigns/templates"
        offset={search.cursor ? search.offset : undefined}
        pageSize={PAGE_SIZE}
        search={{ appId: search.appId, q: search.q, event: search.event, locale: search.locale, cursor: templates.nextCursor }}
        resetTo={search.cursor ? "/campaigns/templates" : undefined}
        resetSearch={{ appId: search.appId, q: search.q, event: search.event, locale: search.locale }}
      />
    </>
  );
}
