import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { Textarea } from "@foundry/ui/textarea";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { type FormEvent, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { ContentFields, type ContentValue } from "../../components/content-fields";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText, isNotFound } from "../../components/error-text";
import { SettingsCard } from "../../components/page/settings-card";
import { Toolbar } from "../../components/page/toolbar";
import { PageHeader } from "../../components/shell/page-header";
import { UnsavedGuard } from "../../components/unsaved-guard";
import { useCan } from "../../components/use-can";
import { deleteTemplateFn, fetchTemplate, previewTemplateFn, updateTemplateFn } from "../../console/templates.fns";
import type { TemplateView } from "../../do/templates";
import { FormError, FormPanel, FormBody } from "../../components/page/form-parts";

export const Route = createFileRoute("/_app/campaigns_/templates_/$templateId")({
  loader: ({ params }) =>
    fetchTemplate({ data: { id: params.templateId } }).catch((err) => {
      if (isNotFound(err)) return { missing: true as const };
      throw err;
    }),
  component: TemplatePage,
});

const crumbs = (appId: string | undefined, label: string) => [
  { label: "Campaigns", to: "/campaigns", search: { appId } },
  { label: "Templates", to: "/campaigns/templates", search: { appId } },
  { label },
];

function TemplatePage() {
  const { appId } = useSearch({ strict: false }) as { appId?: string };
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const canWrite = useCan({ template: ["write"] });
  if (!page) {
    return (
      <>
        <PageHeader crumbs={crumbs(appId, "Template")} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in page) {
    return (
      <>
        <PageHeader crumbs={crumbs(appId, "Template")} />
        <DeniedState reason="not-found" label="Template not found" />
      </>
    );
  }
  return (
    <>
      <PageHeader crumbs={crumbs(page.appId, page.name)} />
      <TemplateForm template={page} canWrite={canWrite} />
    </>
  );
}

function TemplateForm({ template, canWrite }: { template: TemplateView; canWrite: boolean }) {
  const router = useRouter();
  const navigate = useNavigate();
  const [name, setName] = useState(template.name);
  const [event, setEvent] = useState(template.event ?? "");
  const [locale, setLocale] = useState(template.locale);
  const [intro, setIntro] = useState(template.intro ?? "");
  const [enabled, setEnabled] = useState(template.enabled);
  const [content, setContent] = useState<ContentValue>({ subject: template.subject, html: template.html, text: template.text });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const leaving = useRef(false);

  // Preview and save both read the saved row, so the form saves first.
  async function persist() {
    await updateTemplateFn({
      data: {
        id: template.id,
        patch: {
          name,
          event: event.trim() || null,
          locale: locale.trim() || undefined,
          intro: intro.trim() || null,
          enabled,
          ...content,
        },
      },
    });
    await router.invalidate();
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await persist();
      toast.success("Template saved");
    } catch (err) {
      setError(errorText(err, "Could not save this template."));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    await deleteTemplateFn({ data: { id: template.id } });
    toast.success("Template deleted");
    leaving.current = true;
    await navigate({ to: "/campaigns/templates", search: { appId: template.appId } });
  }

  const dirty =
    name !== template.name ||
    event !== (template.event ?? "") ||
    locale !== template.locale ||
    intro !== (template.intro ?? "") ||
    enabled !== template.enabled ||
    content.subject !== template.subject ||
    content.html !== template.html ||
    content.text !== template.text;

  return (
    <>
      <UnsavedGuard when={dirty} bypass={leaving} />
      {canWrite ? (
        <Toolbar>
          <Button type="submit" form="template-form" disabled={pending || !dirty || !name.trim()}>
            Save
          </Button>
        </Toolbar>
      ) : null}
      <FormPanel>
        <form id="template-form" onSubmit={save} className="grid gap-4">
          <SettingsCard title="Content">
            <FormBody as="div">
              <Label htmlFor="template-name-edit">Name</Label>
              <Input id="template-name-edit" value={name} disabled={!canWrite} onChange={(e) => setName(e.target.value)} />
              <ContentFields
                value={content}
                onChange={setContent}
                dataFields
                disabled={!canWrite}
                onPreview={async () => {
                  await persist();
                  return (await previewTemplateFn({ data: { id: template.id } })) ?? null;
                }}
              />
              <FormError message={error} />
            </FormBody>
          </SettingsCard>

          <SettingsCard
            title="Used by your app for"
            description="Your app sends this template when it reports this event in this locale."
          >
            <FormBody as="div">
              <Label htmlFor="template-event">Event key</Label>
              <Input id="template-event" value={event} disabled={!canWrite} onChange={(e) => setEvent(e.target.value)} />
              <Label htmlFor="template-locale">Locale</Label>
              <Input id="template-locale" value={locale} disabled={!canWrite} onChange={(e) => setLocale(e.target.value)} />
            </FormBody>
          </SettingsCard>

          <SettingsCard title="Intro">
            <Textarea
              id="template-intro"
              aria-label="Intro"
              rows={3}
              value={intro}
              disabled={!canWrite}
              onChange={(e) => setIntro(e.target.value)}
            />
          </SettingsCard>

          <SettingsCard title="Enabled">
            <Label className="font-normal">
              <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canWrite} />
              Enabled
            </Label>
          </SettingsCard>
        </form>

        {canWrite ? (
          <SettingsCard
            tone="danger"
            title="Delete template"
            description="The template and its body will be removed. This can't be undone."
            action={
              <ConfirmDialog
                trigger="Delete"
                title={`Delete ${template.name}?`}
                description="The template and its body will be removed. This can't be undone."
                confirmLabel="Delete"
                onConfirm={remove}
              />
            }
          />
        ) : null}
      </FormPanel>
    </>
  );
}
