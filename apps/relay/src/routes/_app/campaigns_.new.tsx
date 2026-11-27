import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { PageDenied } from "../../components/page/page-denied";
import { AppField, needsAppChoice } from "../../components/form/app-field";
import { ChoiceField } from "../../components/form/choice-field";
import { NameField } from "../../components/form/text-field";
import { CreatePage } from "../../components/page/create-page";
import { NoAppState } from "../../components/page/no-app-state";
import { FormActions, FormError } from "../../components/form/form-parts";
import { SettingsCard } from "../../components/page/settings-card";
import { useCan } from "../../components/lib/use-can";
import { createCampaignFn } from "../../console/campaigns.fns";
import { fetchTemplates } from "../../console/templates.fns";
import { str } from "../../components/lib/route-search";
import { useSubmit } from "../../components/lib/use-submit";
import { startApp } from "../../shared/scope";
import { useLoad } from "../../components/lib/use-load";

export const Route = createFileRoute("/_app/campaigns_/new")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: str(search.appId),
  }),
  component: NewCampaignPage,
});

const crumbs = [{ label: "Campaigns", to: "/campaigns" }, { label: "New campaign" }];

function NewCampaignPage() {
  const { appId: scopeParam } = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const { apps } = shell;
  const canWrite = useCan({ campaign: ["write"] });
  const navigate = useNavigate();
  const scopedAppId = apps.some((a) => a.id === scopeParam) ? scopeParam : undefined;
  const [app, setApp] = useState(startApp(apps, scopedAppId) ?? "");
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("blank");
  const [choices, setChoices] = useState<{ id: string; name: string; subject?: string }[]>([]);
  const { pending, error, setError, run } = useSubmit();

  useEffect(() => setTemplate("blank"), [app]);
  useLoad(app ? () => fetchTemplates({ data: { appId: app } }) : null, [app], {
    onData: (t) => setChoices(t?.rows ?? []),
    onError: (copy) => {
      setChoices([]);
      setError(copy);
    },
    fallback: "Could not load the templates.",
  });

  if (!canWrite) {
    return <PageDenied crumbs={crumbs} />;
  }
  if (apps.length === 0) return <NoAppState crumbs={crumbs} what="Campaigns" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const templateId = template !== "blank" ? template : undefined;
      return createCampaignFn({ data: { appId: app, name, templateId } });
    }, "Could not create this campaign.", {
      success: "Campaign created",
      description: name,
      invalidate: false,
      after: (campaign) => navigate({ to: "/campaigns/$campaignId", params: { campaignId: campaign.id }, search: { appId: app } }),
    });
  }

  const describe = choices.length <= 2;
  const choose = needsAppChoice(apps, scopedAppId);
  return (
    <CreatePage crumbs={crumbs} description="Write a message and send it to the people on your lists." onSubmit={submit}>
      <SettingsCard title="Details" description="Name the campaign and pick where it starts.">
        <div className="grid gap-4">
          <AppField apps={apps} scopedAppId={scopedAppId} value={app} onChange={setApp} id="campaign-app" autoFocus={choose} />
          <NameField id="campaign-name" autoFocus={!choose} placeholder="Product update" value={name} onChange={(e) => setName(e.target.value)} />
          <ChoiceField
            id="campaign-template"
            label="Start from"
            value={template}
            onChange={setTemplate}
            options={[
              { value: "blank", label: "Blank campaign", description: describe ? "Write it from scratch." : undefined },
              ...choices.map((t) => ({ value: t.id, label: t.name, description: describe ? t.subject || "Copies this template's content." : undefined })),
            ]}
          />
        </div>
      </SettingsCard>
      <FormError message={error} />
      <FormActions
        onCancel={() => void navigate({ to: "/campaigns", search: { appId: scopedAppId } })}
        submitLabel="Create campaign"
        pending={pending}
        pendingLabel="Creating…"
        disabled={!name.trim()}
        disabledReason="Enter a name first."
      />
    </CreatePage>
  );
}
