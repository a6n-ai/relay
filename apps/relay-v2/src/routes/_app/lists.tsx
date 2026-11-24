import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { CONSENT_LABEL } from "../../components/consent-labels";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { ResourceTable } from "../../components/resource-table";
import { useCan } from "../../components/use-can";
import { ViewHeader } from "../../components/view-header";
import { fetchApps } from "../../console/apps.fns";
import { createListFn, fetchLists } from "../../console/lists.fns";
import type { ConsentSource } from "../../do/lists";

type ListsSearch = { appId?: string };

export const Route = createFileRoute("/_app/lists")({
  validateSearch: (search: Record<string, unknown>): ListsSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const apps = await fetchApps();
    if (!apps) return null;
    const appId = deps.appId ?? apps[0]?.id;
    const lists = appId ? await fetchLists({ data: { appId } }) : [];
    if (!lists) return null;
    return { apps, appId, lists };
  },
  component: ListsPage,
});

const CONSENT_SOURCES = Object.keys(CONSENT_LABEL) as ConsentSource[];

function ListsPage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const navigate = useNavigate({ from: "/lists" });
  const canWrite = useCan({ list: ["write"] });
  if (!page) {
    return (
      <>
        <ViewHeader title="Lists" />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  const { apps, appId, lists } = page;
  return (
    <>
      <ViewHeader
        title="Lists"
        actions={
          canWrite && appId ? (
            <CreateDialog trigger="New list" title="New list">
              {(done) => <NewListForm apps={apps} appId={appId} done={done} />}
            </CreateDialog>
          ) : undefined
        }
      />
      <div className="grid gap-4 p-4">
        {apps.length > 0 ? (
          <Select value={appId ?? ""} onValueChange={(value) => navigate({ search: { appId: value } })}>
            <SelectTrigger aria-label="App" className="w-full sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {apps.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <ResourceTable
          columns={[
            {
              header: "Name",
              cell: (l) => (
                <Link
                  to="/lists/$listId"
                  params={{ listId: l.id }}
                  search={{ appId: l.appId }}
                  className="font-medium hover:underline"
                >
                  {l.name}
                </Link>
              ),
            },
            { header: "App", cell: (l) => apps.find((a) => a.id === l.appId)?.name ?? "" },
            { header: "Contacts", cell: (l) => <span className="tabular-nums">{l.members}</span> },
            { header: "Consent", cell: (l) => CONSENT_LABEL[l.consentSource] },
          ]}
          rows={lists}
          rowKey={(l) => l.id}
          empty="No lists yet"
        />
      </div>
    </>
  );
}

function NewListForm({
  apps,
  appId,
  done,
}: {
  apps: { id: string; name: string }[];
  appId: string;
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
  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="list-app">App</Label>
      <Select value={app} onValueChange={setApp}>
        <SelectTrigger id="list-app" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {apps.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor="list-name">Name</Label>
      <Input id="list-name" required value={name} onChange={(e) => setName(e.target.value)} />
      <Label htmlFor="list-consent">Consent</Label>
      <Select value={consent} onValueChange={(v) => setConsent(v as ConsentSource)}>
        <SelectTrigger id="list-consent" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CONSENT_SOURCES.map((s) => (
            <SelectItem key={s} value={s}>
              {CONSENT_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor="list-note">Note</Label>
      <Input id="list-note" value={note} onChange={(e) => setNote(e.target.value)} />
      <FormError message={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !name.trim() || !app}>
          Create
        </Button>
      </div>
    </form>
  );
}
