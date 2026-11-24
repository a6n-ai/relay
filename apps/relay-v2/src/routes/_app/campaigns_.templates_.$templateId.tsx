import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { Textarea } from "@foundry/ui/textarea";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { ContentFields, type ContentValue } from "../../components/content-fields";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText, isNotFound } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { useCan } from "../../components/use-can";
import { ViewHeader } from "../../components/view-header";
import { deleteTemplateFn, fetchTemplate, previewTemplateFn, updateTemplateFn } from "../../console/templates.fns";
import type { TemplateView } from "../../do/templates";

export const Route = createFileRoute("/_app/campaigns_/templates_/$templateId")({
  loader: ({ params }) =>
    fetchTemplate({ data: { id: params.templateId } }).catch((err) => {
      if (isNotFound(err)) return { missing: true as const };
      throw err;
    }),
  component: TemplatePage,
});

function TemplatePage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const canWrite = useCan({ template: ["write"] });
  if (!page) {
    return (
      <>
        <ViewHeader title="Template" />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in page) {
    return (
      <>
        <ViewHeader title="Template" />
        <DeniedState reason="not-found" label="Template not found" />
      </>
    );
  }
  return (
    <>
      <ViewHeader
        title={page.name}
        actions={
          <Link to="/campaigns/templates" search={{ appId: page.appId }} className="text-sm hover:underline">
            All templates
          </Link>
        }
      />
      <div className="p-4">
        <TemplateForm template={page} canWrite={canWrite} />
      </div>
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
    try {
      await deleteTemplateFn({ data: { id: template.id } });
      toast.success("Template deleted");
      await navigate({ to: "/campaigns/templates", search: { appId: template.appId } });
    } catch (err) {
      toast.error(errorText(err, "Could not delete this template."));
    }
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <form onSubmit={save} className="grid gap-4">
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

        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">Used by your app for</legend>
          <Label htmlFor="template-event">Event key</Label>
          <Input id="template-event" value={event} disabled={!canWrite} onChange={(e) => setEvent(e.target.value)} />
          <Label htmlFor="template-locale">Locale</Label>
          <Input id="template-locale" value={locale} disabled={!canWrite} onChange={(e) => setLocale(e.target.value)} />
          <p className="text-xs text-muted-foreground">Your app sends this template when it reports this event in this locale.</p>
        </fieldset>

        <Label htmlFor="template-intro">Intro</Label>
        <Textarea
          id="template-intro"
          rows={3}
          value={intro}
          disabled={!canWrite}
          onChange={(e) => setIntro(e.target.value)}
        />

        <Label className="flex items-center gap-2 font-normal">
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canWrite} />
          Enabled
        </Label>

        <FormError message={error} />
        {canWrite ? (
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={pending || !name.trim()}>
              Save
            </Button>
          </div>
        ) : null}
      </form>

      {canWrite ? (
        <ConfirmDialog
          trigger="Delete"
          title="Delete this template?"
          description="The template and its body will be removed. This can't be undone."
          confirmLabel="Delete"
          onConfirm={remove}
        />
      ) : null}
    </div>
  );
}
