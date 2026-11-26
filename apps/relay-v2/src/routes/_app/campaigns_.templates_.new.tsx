import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
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
import { createTemplateFn } from "../../console/templates.fns";

export const Route = createFileRoute("/_app/campaigns_/templates_/new")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
  }),
  loader: async () => ({ apps: (await fetchApps()) ?? [] }),
  component: NewTemplatePage,
});

const crumbs = [
  { label: "Campaigns", to: "/campaigns" },
  { label: "Templates", to: "/campaigns/templates" },
  { label: "New template" },
];

function NewTemplatePage() {
  const { apps } = Route.useLoaderData();
  const { appId: scopeParam } = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const canWrite = useCan({ template: ["write"] });
  const navigate = useNavigate();
  const scopedAppId = apps.some((a) => a.id === scopeParam) ? scopeParam : undefined;
  const [app, setApp] = useState(scopedAppId ?? apps[0]?.id ?? "");
  const [name, setName] = useState("");
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
  if (apps.length === 0) return <NoAppState crumbs={crumbs} what="Templates" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const template = await createTemplateFn({ data: { appId: app, input: { name } } });
      toast.success("Template created", { description: name });
      await navigate({ to: "/campaigns/templates/$templateId", params: { templateId: template.id }, search: { appId: app } });
    } catch (err) {
      setError(errorText(err, "Could not create this template."));
    } finally {
      setPending(false);
    }
  }

  const choose = needsAppChoice(apps, scopedAppId);
  return (
    <CreatePage crumbs={crumbs} description="Reusable email content with merge fields for your campaigns." onSubmit={submit}>
      <SettingsCard title="Details" description="Name the template. You write its content next.">
        <div className="grid gap-4">
          <AppField apps={apps} scopedAppId={scopedAppId} value={app} onChange={setApp} id="template-app" autoFocus={choose} />
          <TextField id="template-name" label="Name" autoFocus={!choose} required maxLength={80} placeholder="Welcome email" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </SettingsCard>
      <FormError message={error} />
      <FormActions
        onCancel={() => void navigate({ to: "/campaigns/templates", search: { appId: scopedAppId } })}
        submitLabel="Create template"
        pending={pending}
        pendingLabel="Creating…"
        disabled={!name.trim()}
        disabledReason="Enter a name first."
      />
    </CreatePage>
  );
}
