import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import FileTextIcon from "lucide-react/icons/file-text";
import { useState } from "react";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { isNotFound } from "../../components/error-text";
import { EmptyState } from "../../components/page/empty-state";
import { PageLocalHint } from "../../components/page/page-local-hint";
import { FilterMenu } from "../../components/page/filter-menu";
import { ResourceGrid } from "../../components/page/resource-grid";
import { Hint } from "../../components/page/text";
import { type View, viewPref } from "../../components/page/view-pref";
import { ViewToggle } from "../../components/page/view-toggle";
import { LoadMore } from "../../components/page/load-more";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ResourceTable } from "../../components/resource-table";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { fetchApps } from "../../console/apps.fns";
import { fetchTemplates } from "../../console/templates.fns";
import { formatWhen } from "../../lib/format-date";

type TemplatesSearch = { appId?: string; cursor?: string; offset?: number; q?: string; event?: string; locale?: string };

const PAGE = 50;
const ROUTE = "/campaigns/templates";
const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export const Route = createFileRoute("/_app/campaigns_/templates")({
  validateSearch: (search: Record<string, unknown>): TemplatesSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
    cursor: typeof search.cursor === "string" && search.cursor ? search.cursor : undefined,
    offset: typeof search.offset === "number" && search.offset > 0 ? Math.floor(search.offset) : undefined,
    event: text(search.event),
    locale: text(search.locale),
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId, cursor: search.cursor }),
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Campaigns", to: "/campaigns" }, { label: "Templates" }]} columns={5} search filter view action />,
  loader: async ({ deps }) => {
    const apps = await fetchApps();
    if (!apps) return null;
    const appId = deps.appId ?? apps[0]?.id;
    if (!appId) return { apps, appId, templates: { rows: [], nextCursor: null } };
    const templates = await fetchTemplates({ data: { appId, cursor: deps.cursor } }).catch((err) => {
      if (isNotFound(err)) return { missing: true as const };
      throw err;
    });
    if (!templates) return null;
    return "missing" in templates ? templates : { apps, appId, templates };
  },
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
  const CRUMBS = [{ label: "Campaigns", to: "/campaigns", search: { appId: search.appId } }, { label: "Templates" }];
  if (!page) {
    return (
      <>
        <PageHeader crumbs={CRUMBS} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in page) {
    return (
      <>
        <PageHeader crumbs={CRUMBS} />
        <DeniedState reason="not-found" label="App not found" />
      </>
    );
  }
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
      <PageHeader crumbs={CRUMBS} />
      <Toolbar
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search templates" />}
        filters={<FilterMenu facets={facets} value={search} onChange={(next) => navigate({ search: next as never, replace: true })} />}
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
            <div className="grid gap-1.5 pr-8">
              <span className="font-medium">{t.name}</span>
              <span>
                <Badge variant={t.enabled ? "secondary" : "outline"}>{t.enabled ? "On" : "Off"}</Badge>
              </span>
              {showApp ? <Hint size="xs">{appName(t.appId)}</Hint> : null}
              <Hint size="xs">
                {t.event ?? "No event"} · {t.locale}
              </Hint>
              <Hint size="xs">Updated {formatWhen(t.updatedAt)}</Hint>
            </div>
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
        pageSize={PAGE}
        search={{ appId: search.appId, q: search.q, event: search.event, locale: search.locale, cursor: templates.nextCursor }}
        resetTo={search.cursor ? "/campaigns/templates" : undefined}
        resetSearch={{ appId: search.appId, q: search.q, event: search.event, locale: search.locale }}
      />
    </>
  );
}
