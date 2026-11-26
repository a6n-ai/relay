import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ListIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConsentFields } from "../../components/consent-fields";
import { AppField, needsAppChoice } from "../../components/form/app-field";
import { CONSENT_LABEL } from "../../components/consent-labels";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { ResourceTable } from "../../components/resource-table";
import { FilterMenu } from "../../components/page/filter-menu";
import { ResourceGrid } from "../../components/page/resource-grid";
import { ViewToggle } from "../../components/page/view-toggle";
import { type View, viewPref } from "../../components/page/view-pref";
import { Hint } from "../../components/page/text";
import { useCan } from "../../components/use-can";
import { EmptyState } from "../../components/page/empty-state";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { PageHeader } from "../../components/shell/page-header";
import { useNewParam } from "../../components/shell/create-menu";
import { fetchApps } from "../../console/apps.fns";
import { createListFn, fetchLists } from "../../console/lists.fns";
import type { ConsentSource } from "../../do/lists";
import { FormError, FormBody, FormActions } from "../../components/page/form-parts";

type ListsSearch = { appId?: string; new?: 1; q?: string };

export const Route = createFileRoute("/_app/lists")({
  validateSearch: (search: Record<string, unknown>): ListsSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId }),
  loader: async ({ deps }) => {
    const apps = await fetchApps();
    if (!apps) return null;
    const scoped = deps.appId ? apps.filter((a) => a.id === deps.appId) : apps;
    if (deps.appId && scoped.length === 0) return { missing: true as const };
    const settled = await Promise.allSettled(scoped.map((a) => fetchLists({ data: { appId: a.id } })));
    const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (settled.length > 0 && rejected.length === settled.length) throw rejected[0].reason;
    const results = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (results.some((r) => !r)) return null;
    const lists = results.flatMap((r) => (r && !("missing" in r) ? r : []));
    return { apps, appId: deps.appId, lists };
  },
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Lists" }]} columns={4} search filter view action />,
  component: ListsPage,
});

function ListsPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const canWrite = useCan({ list: ["write"] });
  const [newOpen, setNewOpen] = useNewParam();
  const [query, setQuery] = useUrlFilter("q");
  const navigate = useNavigate();
  const [view, setView] = useState<View>(() => viewPref.read("/lists"));
  const crumbs = [{ label: "Lists" }];
  if (!page) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in page) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason="not-found" label="App not found" />
      </>
    );
  }
  const { apps, appId, lists } = page;
  const defaultApp = appId ?? apps[0]?.id;
  const canCreate = canWrite && !!defaultApp;
  const q = query.trim().toLowerCase();
  const shown = q ? lists.filter((l) => l.name.toLowerCase().includes(q)) : lists;
  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? "—";
  const empty = (
    <EmptyState
      icon={ListIcon}
      title={q ? "No lists match" : "No lists yet"}
      description={q ? undefined : "Lists hold the people a campaign sends to."}
      action={
        !q && canCreate ? (
          <Button variant="outline" onClick={() => setNewOpen(true)}>
            New list
          </Button>
        ) : undefined
      }
    />
  );
  const href = (l: (typeof lists)[number]) => ({ to: "/lists/$listId" as const, params: { listId: l.id }, search: { appId: l.appId } });
  const newList = canCreate ? (
    <CreateDialog title="New list" open={newOpen} onOpenChange={setNewOpen}>
      {(done) => <NewListForm apps={apps} appId={defaultApp} scopedAppId={appId} done={done} />}
    </CreateDialog>
  ) : null;
  return (
    <>
      <PageHeader crumbs={crumbs} />
      <Toolbar
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search lists" />}
        filters={
          apps.length > 1 ? (
            <FilterMenu
              facets={[{ key: "appId", label: "App", options: apps.map((a) => ({ value: a.id, label: a.name })) }]}
              value={search}
              onChange={(next) => void navigate({ to: ".", search: next as never })}
            />
          ) : undefined
        }
        view={<ViewToggle route="/lists" value={view} onChange={setView} />}
      >
        {canCreate ? <Button onClick={() => setNewOpen(true)}>New list</Button> : null}
      </Toolbar>
      {newList}
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
              <Hint size="xs">{appName(l.appId)}</Hint>
              <Hint>
                {l.members} {l.members === 1 ? "contact" : "contacts"} · {CONSENT_LABEL[l.consentSource]}
              </Hint>
            </div>
          )}
        />
      ) : (
        <ResourceTable
          columns={[
            { header: "Name", kind: "name", cell: (l) => l.name },
            { header: "App", cell: (l) => appName(l.appId) },
            { header: "Contacts", cell: (l) => l.members, numeric: true },
            { header: "Consent", cell: (l) => CONSENT_LABEL[l.consentSource] },
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

function NewListForm({
  apps,
  appId,
  scopedAppId,
  done,
}: {
  apps: { id: string; name: string }[];
  appId: string;
  scopedAppId?: string;
  done: () => void;
}) {
  const router = useRouter();
  const [app, setApp] = useState(appId);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState<ConsentSource>("express_optin");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await createListFn({
        data: { appId: app, list: { name, consentSource: consent, consentNote: note.trim() || undefined } },
      });
      toast.success("List created");
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not create this list."));
    } finally {
      setPending(false);
    }
  }
  const choose = needsAppChoice(apps, scopedAppId);
  return (
    <FormBody onSubmit={submit}>
      <AppField apps={apps} scopedAppId={scopedAppId} value={app} onChange={setApp} id="list-app" autoFocus={choose} />
      <div className="grid gap-1.5">
        <Label htmlFor="list-name">Name</Label>
        <Input id="list-name" autoFocus={!choose} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Newsletter subscribers" />
      </div>
      <ConsentFields idPrefix="list" consent={consent} onConsent={setConsent} note={note} onNote={setNote} />
      <FormError message={error} />
      <FormActions cancel pending={pending} pendingLabel="Creating…" submitLabel="Create list" />
    </FormBody>
  );
}
