import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { PageDenied } from "../../components/page/page-denied";
import { AppField, needsAppChoice } from "../../components/form/app-field";
import { NameField } from "../../components/form/text-field";
import { CreatePage } from "../../components/page/create-page";
import { FormActions, FormError } from "../../components/form/form-parts";
import { NoAppState } from "../../components/page/no-app-state";
import { SettingsCard } from "../../components/page/settings-card";
import { useCan } from "../../components/lib/use-can";
import { createTemplateFn } from "../../console/templates.fns";
import { TEMPLATE_NAME_MAX } from "../../shared/limits";
import { str } from "../../components/lib/route-search";
import { startApp } from "../../shared/scope";
import { useSubmit } from "../../components/lib/use-submit";

export const Route = createFileRoute("/_app/campaigns_/templates_/new")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: str(search.appId),
  }),
  component: NewTemplatePage,
});

const crumbs = [
  { label: "Campaigns", to: "/campaigns" },
  { label: "Templates", to: "/campaigns/templates" },
  { label: "New template" },
];

function NewTemplatePage() {
  const { appId: scopeParam } = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const { apps } = shell;
  const canWrite = useCan({ template: ["write"] });
  const navigate = useNavigate();
  const scopedAppId = apps.some((a) => a.id === scopeParam) ? scopeParam : undefined;
  const [app, setApp] = useState(startApp(apps, scopedAppId) ?? "");
  const [name, setName] = useState("");
  const { pending, error, run } = useSubmit();

  if (!canWrite) {
    return <PageDenied crumbs={crumbs} />;
  }
  if (apps.length === 0) return <NoAppState crumbs={crumbs} what="Templates" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      return createTemplateFn({ data: { appId: app, input: { name } } });
    }, "Could not create this template.", {
      success: "Template created",
      description: name,
      invalidate: false,
      after: (template) => navigate({ to: "/campaigns/templates/$templateId", params: { templateId: template.id }, search: { appId: app } }),
    });
  }

  const choose = needsAppChoice(apps, scopedAppId);
  return (
    <CreatePage crumbs={crumbs} description="Reusable email content with merge fields for your campaigns." onSubmit={submit}>
      <SettingsCard title="Details" description="Name the template. You write its content next.">
        <div className="grid gap-4">
          <AppField apps={apps} scopedAppId={scopedAppId} value={app} onChange={setApp} id="template-app" autoFocus={choose} />
          <NameField id="template-name" autoFocus={!choose} maxLength={TEMPLATE_NAME_MAX} placeholder="Welcome email" value={name} onChange={(e) => setName(e.target.value)} />
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
