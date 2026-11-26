import { InputGroup, InputGroupAddon, InputGroupInput } from "@foundry/ui/input-group";
import { toast } from "@foundry/ui/toast";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { createAutomationFn, deleteAutomationFn, updateAutomationFn } from "../console/automations.fns";
import { fetchCampaignOptions } from "../console/campaigns.fns";
import { fetchTemplates } from "../console/templates.fns";
import type { AutomationView } from "../do/automations";
import { errorText } from "./error-text";
import { AppField, needsAppChoice } from "./form/app-field";
import { ChoiceControl, ChoiceField } from "./form/choice-field";
import { EmptyChoice } from "./form/empty-choice";
import { Field, useFieldErrors } from "./form/field";
import { FixedField } from "./form/fixed-field";
import { SenderField } from "./form/sender-field";
import { TextField } from "./form/text-field";
import { DangerCard } from "./page/danger-card";
import { FormActions, FormError } from "./page/form-parts";
import { SettingsCard } from "./page/settings-card";
import { UnsavedGuard } from "./unsaved-guard";

const PRESETS = ["0", "1", "24"];

function DelayField({ value, onChange, error, onClearError }: { value: string; onChange: (hours: string) => void; error?: string; onClearError: () => void }) {
  const [custom, setCustom] = useState(!PRESETS.includes(value));
  return (
    <Field id="automation-delay" label="Send after" error={error} htmlFor={null}>
      <ChoiceControl
        id="automation-delay"
        labelledBy="automation-delay-label"
        describedBy={error ? "automation-delay-error" : undefined}
        invalid={!!error}
        mode="segmented"
        value={custom ? "custom" : value}
        onChange={(v) => {
          setCustom(v === "custom");
          if (v !== "custom") onChange(v);
          onClearError();
        }}
        options={[
          { value: "0", label: "Right away" },
          { value: "1", label: "1 hour" },
          { value: "24", label: "24 hours" },
          { value: "custom", label: "Custom" },
        ]}
      />
      {custom ? (
        <InputGroup>
          <InputGroupInput type="number" min={0} max={720} step={1} aria-label="Delay in hours" aria-invalid={error ? true : undefined} aria-describedby={error ? "automation-delay-error" : undefined} value={value} onChange={(e) => { onClearError(); onChange(e.target.value); }} />
          <InputGroupAddon align="inline-end">hours</InputGroupAddon>
        </InputGroup>
      ) : null}
    </Field>
  );
}

// Create when `automation` is absent. The app and list are fixed once an automation exists.
export function AutomationForm({
  apps,
  appId,
  scopedAppId,
  automation,
  listName,
}: {
  apps: { id: string; name: string }[];
  appId: string;
  scopedAppId?: string;
  automation?: AutomationView;
  listName?: string;
}) {
  const navigate = useNavigate();
  const [app, setApp] = useState(appId);
  const [name, setName] = useState(automation?.name ?? "");
  const [listId, setListId] = useState("");
  const [templateId, setTemplateId] = useState(automation?.templateId ?? "");
  const [fromEmail, setFromEmail] = useState(automation?.fromEmail ?? "");
  const [delay, setDelay] = useState(String(automation?.delayHours ?? 0));
  const [choices, setChoices] = useState<{
    lists: { id: string; name: string }[];
    templates: { id: string; name: string }[];
    senders: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fe = useFieldErrors<"name" | "list" | "template" | "from" | "delay">();
  const [pending, setPending] = useState(false);
  const leaving = useRef(false);

  // Lists, templates and From addresses belong to one app, so they reload when the app changes.
  useEffect(() => {
    let live = true;
    setChoices(null);
    Promise.all([fetchCampaignOptions({ data: { appId: app } }), fetchTemplates({ data: { appId: app } })])
      .then(([options, templates]) => {
        if (live) setChoices({ lists: options?.lists ?? [], templates: templates?.rows ?? [], senders: options?.senders ?? [] });
      })
      .catch(() => {
        if (live) setChoices({ lists: [], templates: [], senders: [] });
      });
    return () => {
      live = false;
    };
  }, [app]);

  // Exactly one list or template needs no choosing.
  useEffect(() => {
    if (automation || !choices) return;
    if (choices.lists.length === 1) setListId(choices.lists[0]?.id ?? "");
    if (choices.templates.length === 1) setTemplateId(choices.templates[0]?.id ?? "");
  }, [choices, automation]);

  const dirty =
    !automation ||
    name.trim() !== automation.name ||
    templateId !== automation.templateId ||
    fromEmail !== automation.fromEmail ||
    Number(delay) !== automation.delayHours;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const missing = {
      ...(name.trim() ? {} : { name: "Enter a name." }),
      ...(automation || listId ? {} : { list: "Choose a list." }),
      ...(templateId ? {} : { template: "Choose a template." }),
      ...(fromEmail ? {} : { from: "Choose a send-from address." }),
      ...(delay.trim() === "" ? { delay: "Enter a delay in hours." } : {}),
    };
    fe.set(missing);
    if (Object.keys(missing).length > 0) return;
    setPending(true);
    setError(null);
    try {
      const delayHours = Number(delay);
      if (automation) {
        await updateAutomationFn({ data: { id: automation.id, patch: { name: name.trim(), templateId, fromEmail, delayHours } } });
        toast.success("Automation saved", { description: name.trim() });
      } else {
        await createAutomationFn({ data: { appId: app, automation: { name, listId, templateId, fromEmail, delayHours } } });
        toast.success("Automation created", { description: name.trim() });
      }
      leaving.current = true;
      await navigate({ to: "/campaigns/automations", search: { appId: app } });
    } catch (err) {
      setError(errorText(err, automation ? "Could not save this automation." : "Could not create this automation."));
    } finally {
      setPending(false);
    }
  }

  const listOptions = (choices?.lists ?? []).map((l) => ({ value: l.id, label: l.name }));
  const templateOptions = (choices?.templates ?? []).map((t) => ({ value: t.id, label: t.name }));
  const noLists = choices !== null && listOptions.length === 0;
  const noTemplates = choices !== null && templateOptions.length === 0;
  async function remove() {
    if (!automation) return;
    await deleteAutomationFn({ data: { id: automation.id } });
    toast.success("Automation deleted", { description: automation.name });
    leaving.current = true;
    await navigate({ to: "/campaigns/automations", search: { appId: automation.appId } });
  }
  const choose = needsAppChoice(apps, scopedAppId);
  const back = () => void navigate({ to: "/campaigns/automations", search: { appId: app } });
  return (
    <div className="grid max-w-2xl gap-4 px-4 pb-8 pt-2">
    <form onSubmit={submit} className="grid gap-4">
      <UnsavedGuard when={Boolean(automation) && dirty} bypass={leaving} />
      <SettingsCard title="Trigger" description="Relay sends the message when someone joins this list.">
        <div className="grid gap-4">
          {automation ? (
            <FixedField label="App" value={apps.find((a) => a.id === app)?.name ?? "—"} hint="To use another app, create a new automation there." />
          ) : (
            <AppField
              apps={apps}
              scopedAppId={scopedAppId}
              value={app}
              onChange={(v) => {
                setApp(v);
                setListId("");
                setTemplateId("");
                setFromEmail("");
              }}
              id="automation-app"
              autoFocus={choose}
            />
          )}
          {automation ? (
            <FixedField label="List" value={listName ?? "—"} hint="To use another list, create a new automation." />
          ) : noLists ? (
            <EmptyChoice id="automation-list" label="List" message="No lists yet." to="/lists/new" search={{ appId: app }} linkLabel="Create a list" error={fe.errors.list} />
          ) : (
            <ChoiceField id="automation-list" label="List" value={listId} onChange={setListId} options={listOptions} error={fe.errors.list} onClearError={() => fe.clear("list")} />
          )}
        </div>
      </SettingsCard>
      <SettingsCard title="Message" description="What it sends, and who it comes from.">
        <div className="grid gap-4">
          <TextField
            id="automation-name"
            label="Name"
            autoFocus={!choose}
            required
            maxLength={80}
            placeholder="Welcome new subscribers"
            value={name}
            error={fe.errors.name}
            onClearError={() => fe.clear("name")}
            onChange={(e) => setName(e.target.value)}
          />
          {noTemplates ? (
            <EmptyChoice id="automation-template" label="Template" message="No templates yet." to="/campaigns/templates/new" search={{ appId: app }} linkLabel="Create a template" error={fe.errors.template} />
          ) : (
            <ChoiceField id="automation-template" label="Template" value={templateId} onChange={setTemplateId} options={templateOptions} error={fe.errors.template} onClearError={() => fe.clear("template")} />
          )}
          {choices ? (
            <SenderField id="automation-from" appId={app} senders={choices.senders.map((s) => ({ value: s, label: s }))} value={fromEmail} onChange={setFromEmail} error={fe.errors.from} onClearError={() => fe.clear("from")} />
          ) : null}
        </div>
      </SettingsCard>
      <SettingsCard title="Timing" description="How long to wait after they join.">
        <DelayField value={delay} onChange={setDelay} error={fe.errors.delay} onClearError={() => fe.clear("delay")} />
      </SettingsCard>
      <FormError message={error} />
      <FormActions
        onCancel={back}
        pending={pending}
        pendingLabel={automation ? "Saving…" : "Creating…"}
        disabled={!name.trim() || !dirty}
        disabledReason={name.trim() ? "Change something to save." : "Enter a name first."}
        submitLabel={automation ? "Save automation" : "Create automation"}
      />
    </form>
    {automation ? (
      <DangerCard
        title="Delete this automation"
        description="Messages waiting to go out are dropped. Mail already sent is unaffected."
        buttonLabel="Delete automation"
        confirmTitle={`Delete ${automation.name}?`}
        onConfirm={remove}
      />
    ) : null}
    </div>
  );
}
