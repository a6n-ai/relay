import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConsentFields } from "../../components/consent-fields";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { AppField, needsAppChoice } from "../../components/form/app-field";
import { TextField } from "../../components/form/text-field";
import { CreatePage } from "../../components/page/create-page";
import { FormActions, FormError } from "../../components/page/form-parts";
import { NoAppState } from "../../components/page/no-app-state";
import { SettingsCard } from "../../components/page/settings-card";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { fetchApps } from "../../console/apps.fns";
import { createListFn } from "../../console/lists.fns";
import type { ConsentSource } from "../../do/lists";

export const Route = createFileRoute("/_app/lists_/new")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
  }),
  loader: async () => ({ apps: (await fetchApps()) ?? [] }),
  component: NewListPage,
});

const crumbs = [{ label: "Lists", to: "/lists" }, { label: "New list" }];

function NewListPage() {
  const { apps } = Route.useLoaderData();
  const { appId: scopeParam } = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const canWrite = useCan({ list: ["write"] });
  const navigate = useNavigate();
  const scopedAppId = apps.some((a) => a.id === scopeParam) ? scopeParam : undefined;
  const [app, setApp] = useState(scopedAppId ?? apps[0]?.id ?? "");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState<ConsentSource>("express_optin");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!canWrite) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if (apps.length === 0) return <NoAppState crumbs={crumbs} what="Lists" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const list = await createListFn({ data: { appId: app, list: { name, consentSource: consent, consentNote: note.trim() || undefined } } });
      toast.success("List created", { description: name });
      await navigate({ to: "/lists/$listId", params: { listId: list.id }, search: { appId: app } });
    } catch (err) {
      setError(errorText(err, "Could not create this list."));
    } finally {
      setPending(false);
    }
  }

  const choose = needsAppChoice(apps, scopedAppId);
  return (
    <CreatePage crumbs={crumbs} description="Lists hold the people a campaign sends to." onSubmit={submit}>
      <SettingsCard title="Details" description="Name the list.">
        <div className="grid gap-4">
          <AppField apps={apps} scopedAppId={scopedAppId} value={app} onChange={setApp} id="list-app" autoFocus={choose} />
          <TextField id="list-name" label="Name" autoFocus={!choose} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Newsletter subscribers" />
        </div>
      </SettingsCard>
      <SettingsCard title="Permission" description="We keep this as your record of consent.">
        <div className="grid gap-4">
          <ConsentFields idPrefix="list" consent={consent} onConsent={setConsent} note={note} onNote={setNote} />
        </div>
      </SettingsCard>
      <FormError message={error} />
      <FormActions
        onCancel={() => void navigate({ to: "/lists", search: { appId: scopedAppId } })}
        submitLabel="Create list"
        pending={pending}
        pendingLabel="Creating…"
        disabled={!name.trim()}
        disabledReason="Enter a name first."
      />
    </CreatePage>
  );
}
