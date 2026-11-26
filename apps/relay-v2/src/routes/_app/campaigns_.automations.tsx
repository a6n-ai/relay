import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import WorkflowIcon from "lucide-react/icons/workflow";
import { Switch } from "@foundry/ui/switch";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { AppSelect } from "../../components/app-select";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { EmptyState } from "../../components/page/empty-state";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { Toolbar } from "../../components/page/toolbar";
import { ResourceTable } from "../../components/resource-table";
import { useNewParam } from "../../components/shell/create-menu";
import { PageHeader } from "../../components/shell/page-header";
import { runAction } from "../../components/run-action";
import { useCan } from "../../components/use-can";
import { fetchApps } from "../../console/apps.fns";
import { createAutomationFn, enableAutomationFn, fetchAutomations } from "../../console/automations.fns";
import { fetchCampaignOptions } from "../../console/campaigns.fns";
import { fetchTemplates } from "../../console/templates.fns";
import { FormBody, FormActions } from "../../components/page/form-parts";

type AutomationsSearch = { appId?: string; new?: 1 };

export const Route = createFileRoute("/_app/campaigns_/automations")({
  validateSearch: (search: Record<string, unknown>): AutomationsSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
    new: search.new === 1 || search.new === "1" ? 1 : undefined,
  }),
  loaderDeps: ({ search }) => ({ appId: search.appId }),
  pendingComponent: () => <TableSkeleton columns={7} />,
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
  return (
    <>
      <PageHeader crumbs={CRUMBS} />
      <Toolbar>{newButton}</Toolbar>
      {canCreate && appId ? (
        <CreateDialog title="New automation" open={open} onOpenChange={setOpen}>
          {(done) => <NewAutomationForm apps={apps} appId={appId} done={done} />}
        </CreateDialog>
      ) : null}
      <ResourceTable
        columns={[
          { header: "Name", kind: "name", cell: (a) => a.name },
          ...(search.appId ? [] : [{ header: "App", cell: () => apps.find((a) => a.id === appId)?.name ?? "—" }]),
          { header: "List", cell: (a) => lists.find((l) => l.id === a.listId)?.name ?? "—" },
          { header: "Template", cell: (a) => templates.find((t) => t.id === a.templateId)?.name ?? "—" },
          { header: "Delay", cell: (a) => (a.delayHours === 0 ? "Right away" : `After ${a.delayHours} hours`) },
          { header: "Waiting", numeric: true, cell: (a) => a.pending },
          { header: "Sent", numeric: true, cell: (a) => a.sent },
          {
            header: "Enabled",
            cell: (a) => (
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
            ),
          },
        ]}
        rows={automations}
        rowKey={(a) => a.id}
        empty={
          <EmptyState
            icon={WorkflowIcon}
            title="No automations yet."
            description="Send a template when someone joins a list."
            action={newButton}
          />
        }
      />
    </>
  );
}

function NewAutomationForm({
  apps,
  appId,
  done,
}: {
  apps: { id: string; name: string }[];
  appId: string;
  done: () => void;
}) {
  const router = useRouter();
  const [app, setApp] = useState(appId);
  const [name, setName] = useState("");
  const [listId, setListId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [delay, setDelay] = useState("0");
  const [choices, setChoices] = useState<{
    lists: { id: string; name: string }[];
    templates: { id: string; name: string }[];
    senders: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await createAutomationFn({
        data: { appId: app, automation: { name, listId, templateId, fromEmail, delayHours: Number(delay) } },
      });
      toast.success("Automation created");
      done();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err, "Could not create this automation."));
    } finally {
      setPending(false);
    }
  }

  return (
    <FormBody onSubmit={submit}>
      <Label htmlFor="automation-app">App</Label>
      <AppSelect
        apps={apps}
        value={app}
        onValueChange={(v) => {
          setApp(v);
          setListId("");
          setTemplateId("");
          setFromEmail("");
        }}
        id="automation-app"
      />
      <Label htmlFor="automation-name">Name</Label>
      <Input id="automation-name" required value={name} onChange={(e) => setName(e.target.value)} />
      <Label htmlFor="automation-list">List</Label>
      <Select value={listId} onValueChange={(v) => setListId(v ?? "")}>
        <SelectTrigger id="automation-list" aria-label="List">
          <SelectValue placeholder="Choose a list" />
        </SelectTrigger>
        <SelectContent>
          {(choices?.lists ?? []).map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor="automation-template">Template</Label>
      <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")}>
        <SelectTrigger id="automation-template" aria-label="Template">
          <SelectValue placeholder="Choose a template" />
        </SelectTrigger>
        <SelectContent>
          {(choices?.templates ?? []).map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor="automation-from">From</Label>
      <Select value={fromEmail} onValueChange={(v) => setFromEmail(v ?? "")}>
        <SelectTrigger id="automation-from" aria-label="From">
          <SelectValue placeholder="Choose a verified address" />
        </SelectTrigger>
        <SelectContent>
          {(choices?.senders ?? []).map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor="automation-delay">Delay (hours)</Label>
      <Input
        id="automation-delay"
        type="number"
        min={0}
        max={720}
        step={1}
        value={delay}
        onChange={(e) => setDelay(e.target.value)}
      />
      <FormError message={error} />
      <FormActions>
        <Button type="submit" disabled={pending || !name.trim() || !listId || !templateId || !fromEmail}>
          Create automation
        </Button>
      </FormActions>
    </FormBody>
  );
}
