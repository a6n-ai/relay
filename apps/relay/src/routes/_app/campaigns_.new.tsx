import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { AppField, needsAppChoice } from "../../components/form/app-field";
import { ChoiceField } from "../../components/form/choice-field";
import { NameField } from "../../components/form/text-field";
import { CreatePage } from "../../components/page/create-page";
import { NoAppState } from "../../components/page/no-app-state";
import { FormActions, FormError } from "../../components/page/form-parts";
import { SettingsCard } from "../../components/page/settings-card";
import { PageHeader } from "../../components/shell/page-header";
import { useCan } from "../../components/use-can";
import { fetchApps } from "../../console/apps.fns";
import { createCampaignFn } from "../../console/campaigns.fns";
import { fetchTemplates } from "../../console/templates.fns";
import { str } from "../../lib/route-search";

export const Route = createFileRoute("/_app/campaigns_/new")({
  validateSearch: (search: Record<string, unknown>): { appId?: string } => ({
    appId: str(search.appId),
  }),
  loader: async () => ({ apps: (await fetchApps()) ?? [] }),
  component: NewCampaignPage,
});

const crumbs = [{ label: "Campaigns", to: "/campaigns" }, { label: "New campaign" }];

function NewCampaignPage() {
  const { apps } = Route.useLoaderData();
  const { appId: scopeParam } = Route.useSearch();
  const { shell } = Route.useRouteContext();
  const canWrite = useCan({ campaign: ["write"] });
  const navigate = useNavigate();
  const scopedAppId = apps.some((a) => a.id === scopeParam) ? scopeParam : undefined;
  const [app, setApp] = useState(scopedAppId ?? apps[0]?.id ?? "");
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("blank");
  const [choices, setChoices] = useState<{ id: string; name: string; subject?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setTemplate("blank");
    if (!app) return;
    let live = true;
    fetchTemplates({ data: { appId: app } })
      .then((t) => live && setChoices(t?.rows ?? []))
      .catch((err) => {
        if (!live) return;
        setChoices([]);
        setError(errorText(err, "Could not load the templates."));
      });
    return () => {
      live = false;
    };
  }, [app]);

  if (!canWrite) {
    return (
      <>
        <PageHeader crumbs={crumbs} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if (apps.length === 0) return <NoAppState crumbs={crumbs} what="Campaigns" />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const templateId = template !== "blank" ? template : undefined;
      const campaign = await createCampaignFn({ data: { appId: app, name, templateId } });
      toast.success("Campaign created", { description: name });
      await navigate({ to: "/campaigns/$campaignId", params: { campaignId: campaign.id }, search: { appId: app } });
    } catch (err) {
      setError(errorText(err, "Could not create this campaign."));
    } finally {
      setPending(false);
    }
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
