import { Button } from "@foundry/ui/button";
import { TextField } from "../../components/form/text-field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@foundry/ui/input-group";
import WorkflowIcon from "lucide-react/icons/workflow";
import { Switch } from "@foundry/ui/switch";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { AppField } from "../../components/form/app-field";
import { ChoiceControl, ChoiceField } from "../../components/form/choice-field";
import { EmptyChoice } from "../../components/form/empty-choice";
import { Field, useFieldErrors } from "../../components/form/field";
import { FixedField } from "../../components/form/fixed-field";
import { SenderField } from "../../components/form/sender-field";
import { FilterMenu } from "../../components/page/filter-menu";
import { ResourceGrid } from "../../components/page/resource-grid";
import { Hint } from "../../components/page/text";
import { type View, viewPref } from "../../components/page/view-pref";
import { ViewToggle } from "../../components/page/view-toggle";
import { EmptyState } from "../../components/page/empty-state";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { Toolbar } from "../../components/page/toolbar";
import { ResourceTable } from "../../components/resource-table";
import { useNewParam } from "../../components/shell/new-param";
import { PageHeader } from "../../components/shell/page-header";
import { confirmAction, runAction } from "../../components/run-action";
import { useCan } from "../../components/use-can";
import { fetchApps } from "../../console/apps.fns";
import { createAutomationFn, deleteAutomationFn, enableAutomationFn, fetchAutomations, updateAutomationFn } from "../../console/automations.fns";
import { fetchCampaignOptions } from "../../console/campaigns.fns";
import { fetchTemplates } from "../../console/templates.fns";
import type { AutomationView } from "../../do/automations";
import { FormError, FormBody, FormActions } from "../../components/page/form-parts";

type AutomationsSearch = { appId?: string; new?: 1; status?: "on" | "off" };

const ROUTE = "/campaigns/automations";

export const Route = createFileRoute("/_app/campaigns_/automations")({
  validateSearch: (search: Record<string, unknown>): AutomationsSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
    status: search.status === "on" || search.status === "off" ? search.status : undefined,
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId }),
  pendingComponent: () => <ListSkeleton crumbs={[{ label: "Campaigns", to: "/campaigns" }, { label: "Automations" }]} columns={7} filter view action />,
  loader: async ({ deps }) => {
    const apps = await fetchApps();
    if (!apps) return null;
    const appId = deps.appId ?? apps[0]?.id;
    if (!appId) return { apps, appId, automations: [], lists: [], templates: [] };
    const automations = await fetchAutomations({ data: { appId } });
    if (!automations) return null;
    if ("missing" in automations) return automations;
    // Names are only labels in the table, so a failed read leaves the ids visible instead of hiding the page.
    const [options, templates] = await Promise.all([
      fetchCampaignOptions({ data: { appId } }),
      fetchTemplates({ data: { appId } }),
    ]);
    return { apps, appId, automations, lists: options?.lists ?? [], templates: templates?.rows ?? [] };
  },
  component: AutomationsPage,
});


function AutomationsPage() {
  const page = Route.useLoaderData();
  const { shell } = Route.useRouteContext();
  const search = Route.useSearch();
  const router = useRouter();
  const canSend = useCan({ campaign: ["send"] });
  const [open, setOpen] = useNewParam();
  const navigate = useNavigate({ from: "/campaigns/automations" });
  const [view, setView] = useState<View>(() => viewPref.read(ROUTE));
  const [editing, setEditing] = useState<AutomationView | null>(null);
  const [deleting, setDeleting] = useState<AutomationView | null>(null);
  const CRUMBS = [{ label: "Campaigns", to: "/campaigns", search: { appId: search.appId } }, { label: "Automations" }];
  if (!page) {
    return (
      <>
        <PageHeader crumbs={CRUMBS} />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in page) {
    return (
      <>
        <PageHeader crumbs={CRUMBS} />
        <DeniedState reason="not-found" label="App not found" />
      </>
    );
  }
  const { apps, appId, automations, lists, templates } = page;
  const canCreate = canSend && Boolean(appId);
  const newButton = canCreate ? <Button onClick={() => setOpen(true)}>New automation</Button> : null;
  const rows = automations.filter((a) => !search.status || a.enabled === (search.status === "on"));
  const facets = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "on", label: "On" },
        { value: "off", label: "Off" },
      ],
    },
  ];
  const showApp = !search.appId;
  const appName = (id: string) => apps.find((a) => a.id === id)?.name ?? "—";
  const listName = (id: string) => lists.find((l) => l.id === id)?.name ?? "—";
  const templateName = (id: string) => templates.find((t) => t.id === id)?.name ?? "—";
  const delayText = (a: AutomationView) => (a.delayHours === 0 ? "Right away" : `After ${a.delayHours} ${a.delayHours === 1 ? "hour" : "hours"}`);
  const menu = (a: AutomationView) => [
    { label: "Edit", onSelect: () => setEditing(a), hidden: !canSend },
    { label: "Delete", onSelect: () => setDeleting(a), destructive: true, hidden: !canSend },
  ];
  const toggle = (a: AutomationView) => (
    <Switch
      checked={a.enabled}
      disabled={!canSend}
      aria-label={`Enabled for ${a.name}`}
      onCheckedChange={(on) =>
        runAction(
          () => enableAutomationFn({ data: { id: a.id, on } }),
          on ? "Automation turned on" : "Automation turned off",
          () => router.invalidate(),
        )
      }
    />
  );
  const empty =
    automations.length === 0 ? (
      <EmptyState
        icon={WorkflowIcon}
        title="No automations yet."
        description="Send a template when someone joins a list."
        action={canCreate ? <Button variant="outline" onClick={() => setOpen(true)}>New automation</Button> : undefined}
      />
    ) : (
      "No automations match."
    );
  return (
    <>
      <PageHeader crumbs={CRUMBS} />
      <Toolbar
        filters={<FilterMenu facets={facets} value={search} onChange={(next) => navigate({ search: next as never, replace: true })} />}
        view={<ViewToggle route={ROUTE} value={view} onChange={setView} />}
      >
        {newButton}
      </Toolbar>
      {canCreate && appId ? (
        <CreateDialog title="New automation" open={open} onOpenChange={setOpen}>
          {(done) => <AutomationForm apps={apps} appId={appId} scopedAppId={search.appId} done={done} />}
        </CreateDialog>
      ) : null}
      <CreateDialog title="Edit automation" open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {(done) =>
          editing ? <AutomationForm key={editing.id} apps={apps} appId={editing.appId} automation={editing} listName={listName(editing.listId)} done={done} /> : null
        }
      </CreateDialog>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "automation"}?`}
        description="Waiting messages are dropped. Mail already sent is unaffected."
        confirmLabel="Delete automation"
        onConfirm={() => confirmAction(() => deleteAutomationFn({ data: { id: deleting?.id ?? "" } }), "Automation deleted", () => router.invalidate())}
      />
      {view === "grid" ? (
        <ResourceGrid
          items={rows}
          rowKey={(a) => a.id}
          menu={menu}
          empty={empty}
          card={(a) => (
            <div className="grid gap-1.5 pr-8">
              <span className="font-medium">{a.name}</span>
              {showApp ? <Hint size="xs">{appName(a.appId)}</Hint> : null}
              <Hint size="xs">
                {listName(a.listId)} · {templateName(a.templateId)}
              </Hint>
              <Hint size="xs">
                {delayText(a)} · {a.pending} waiting · {a.sent} sent
              </Hint>
              <div>{toggle(a)}</div>
            </div>
          )}
        />
      ) : (
        <ResourceTable
          columns={[
            { header: "Name", kind: "name", cell: (a) => a.name },
            ...(showApp ? [{ header: "App", cell: (a: AutomationView) => appName(a.appId) }] : []),
            { header: "List", cell: (a) => listName(a.listId) },
            { header: "Template", cell: (a) => templateName(a.templateId) },
            { header: "Delay", cell: delayText },
            { header: "Waiting", numeric: true, cell: (a) => a.pending },
            { header: "Sent", numeric: true, cell: (a) => a.sent },
            { header: "Enabled", cell: toggle },
          ]}
          rows={rows}
          rowKey={(a) => a.id}
          menu={menu}
          empty={empty}
        />
      )}
    </>
  );
}

const PRESETS = ["0", "1", "24"];

function DelayField({ value, onChange, error, onClearError }: { value: string; onChange: (hours: string) => void; error?: string; onClearError: () => void }) {
  const [custom, setCustom] = useState(!PRESETS.includes(value));
  return (
    <Field id="automation-delay" label="Delay" error={error} htmlFor={null}>
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

// Create when `automation` is absent. The list is fixed once an automation exists.
function AutomationForm({
  apps,
  appId,
  scopedAppId,
  automation,
  listName,
  done,
}: {
  apps: { id: string; name: string }[];
  appId: string;
  scopedAppId?: string;
  automation?: AutomationView;
  listName?: string;
  done: () => void;
}) {
  const router = useRouter();
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

  // Lists, templates and From addresses belong to one app, so they reload when the dialog's app changes.
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
      } else {
        await createAutomationFn({ data: { appId: app, automation: { name, listId, templateId, fromEmail, delayHours } } });
      }
      toast.success(automation ? "Automation saved" : "Automation created");
      done();
      await router.invalidate();
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
  return (
    <FormBody onSubmit={submit}>
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
        />
      )}
      <TextField
        id="automation-name"
        label="Name"
        autoFocus
        required
        maxLength={80}
        placeholder="Welcome email after sign-up"
        value={name}
        error={fe.errors.name}
        onClearError={() => fe.clear("name")}
        onChange={(e) => setName(e.target.value)}
      />
      {automation ? (
        <FixedField label="List" value={listName ?? "—"} hint="To use another list, create a new automation." />
      ) : noLists ? (
        <EmptyChoice id="automation-list" label="List" message="No lists yet." to="/lists" search={{ new: 1 }} linkLabel="Create a list" onNavigate={done} error={fe.errors.list} />
      ) : (
        <ChoiceField id="automation-list" label="List" value={listId} onChange={setListId} options={listOptions} error={fe.errors.list} onClearError={() => fe.clear("list")} />
      )}
      {noTemplates ? (
        <EmptyChoice id="automation-template" label="Template" message="No templates yet." to="/campaigns/templates" search={{ new: 1 }} linkLabel="Create a template" onNavigate={done} error={fe.errors.template} />
      ) : (
        <ChoiceField id="automation-template" label="Template" value={templateId} onChange={setTemplateId} options={templateOptions} error={fe.errors.template} onClearError={() => fe.clear("template")} />
      )}
      {choices ? (
        <SenderField id="automation-from" senders={choices.senders.map((s) => ({ value: s, label: s }))} value={fromEmail} onChange={setFromEmail} onNavigate={done} error={fe.errors.from} onClearError={() => fe.clear("from")} />
      ) : null}
      <DelayField value={delay} onChange={setDelay} error={fe.errors.delay} onClearError={() => fe.clear("delay")} />
      <FormError message={error} />
      <FormActions
        cancel
        pending={pending}
        pendingLabel={automation ? "Saving…" : "Creating…"}
        disabled={!name.trim() || !dirty}
        disabledReason={name.trim() ? "Change something to save." : "Enter a name first."}
        submitLabel={automation ? "Save automation" : "Create automation"}
      />
    </FormBody>
  );
}
