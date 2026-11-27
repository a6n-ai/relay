import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConsentFields } from "../../components/lists/consent-fields";
import { PageDenied } from "../../components/page/page-denied";
import { AppField, needsAppChoice } from "../../components/form/app-field";
import { NameField } from "../../components/form/text-field";
import { CreatePage } from "../../components/page/create-page";
import { FormActions, FormError } from "../../components/form/form-parts";
import { NoAppState } from "../../components/page/no-app-state";
import { SettingsCard } from "../../components/page/settings-card";
import { useCan } from "../../components/lib/use-can";
import { createListFn } from "../../console/lists.fns";
import { type ConsentSource } from "../../shared/views";
import { str } from "../../components/lib/route-search";
import { startApp } from "../../shared/scope";
import { useSubmit } from "../../components/lib/use-submit";

export const Route = createFileRoute("/_app/lists_/new")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: str(search.appId),
  }),
  component: NewListPage,
});

const crumbs = [{ label: "Lists", to: "/lists" }, { label: "New list" }];

function NewListPage() {
  const { appId: scopeParam } = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const { apps } = shell;
  const canWrite = useCan({ list: ["write"] });
  const navigate = useNavigate();
  const scopedAppId = apps.some((a) => a.id === scopeParam) ? scopeParam : undefined;
  const [app, setApp] = useState(startApp(apps, scopedAppId) ?? "");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState<ConsentSource>("express_optin");
  const [note, setNote] = useState("");
  const { pending, error, run } = useSubmit();

  if (!canWrite) {
    return <PageDenied crumbs={crumbs} />;
  }
  if (apps.length === 0) return <NoAppState crumbs={crumbs} what="Lists" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      return createListFn({ data: { appId: app, list: { name, consentSource: consent, consentNote: note.trim() || undefined } } });
    }, "Could not create this list.", {
      success: "List created",
      description: name,
      invalidate: false,
      after: (list) => navigate({ to: "/lists/$listId", params: { listId: list.id }, search: { appId: app } }),
    });
  }

  const choose = needsAppChoice(apps, scopedAppId);
  return (
    <CreatePage crumbs={crumbs} description="Lists hold the people a campaign sends to." onSubmit={submit}>
      <SettingsCard title="Details" description="Name the list.">
        <div className="grid gap-4">
          <AppField apps={apps} scopedAppId={scopedAppId} value={app} onChange={setApp} id="list-app" autoFocus={choose} />
          <NameField id="list-name" autoFocus={!choose} value={name} onChange={(e) => setName(e.target.value)} placeholder="Newsletter subscribers" />
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
