import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Switch } from "@foundry/ui/switch";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { AppSelect } from "../../components/app-select";
import { CampaignsTabs } from "../../components/campaigns-tabs";
import { CreateDialog } from "../../components/create-dialog";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { errorText } from "../../components/error-text";
import { FormError } from "../../components/form-error";
import { ResourceTable } from "../../components/resource-table";
import { runAction } from "../../components/run-action";
import { useCan } from "../../components/use-can";
import { ViewHeader } from "../../components/view-header";
import { fetchApps } from "../../console/apps.fns";
import { createAutomationFn, enableAutomationFn, fetchAutomations } from "../../console/automations.fns";
import { fetchCampaignOptions } from "../../console/campaigns.fns";
import { fetchTemplates } from "../../console/templates.fns";

type AutomationsSearch = { appId?: string };

export const Route = createFileRoute("/_app/campaigns_/automations")({
  validateSearch: (search: Record<string, unknown>): AutomationsSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
  }),
  loaderDeps: ({ search }) => search,
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
  const navigate = useNavigate({ from: "/campaigns/automations" });
  const router = useRouter();
  const canSend = useCan({ campaign: ["send"] });
  if (!page) {
    return (
      <>
        <ViewHeader title="Campaigns" />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in page) {
    return (
      <>
        <ViewHeader title="Campaigns" />
        <DeniedState reason="not-found" label="App not found" />
      </>
    );
  }
  const { apps, appId, automations, lists, templates } = page;
  return (
    <>
      <ViewHeader
        title="Campaigns"
        actions={
          canSend && appId ? (
            <CreateDialog trigger="New automation" title="New automation">
              {(done) => <NewAutomationForm apps={apps} appId={appId} done={done} />}
            </CreateDialog>
          ) : undefined
        }
      />
      <CampaignsTabs active="automations" appId={appId} />
      <div className="grid gap-4 p-4">
        {apps.length > 0 ? (
          <AppSelect
            apps={apps}
            value={appId ?? ""}
            onValueChange={(value) => navigate({ search: { appId: value } })}
            className="w-full sm:max-w-xs"
          />
        ) : null}
        <ResourceTable
          columns={[
            { header: "Name", cell: (a) => a.name },
            { header: "List", cell: (a) => lists.find((l) => l.id === a.listId)?.name ?? "Unknown list" },
            { header: "Template", cell: (a) => templates.find((t) => t.id === a.templateId)?.name ?? "Unknown template" },
            { header: "Delay", cell: (a) => (a.delayHours === 0 ? "Right away" : `After ${a.delayHours} hours`) },
            { header: "Waiting", cell: (a) => <span className="tabular-nums">{a.pending}</span> },
            { header: "Sent", cell: (a) => <span className="tabular-nums">{a.sent}</span> },
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
          empty="No automations yet"
        />
      </div>
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
    <form onSubmit={submit} className="grid gap-3">
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
        <SelectTrigger id="automation-list" aria-label="List" className="w-full">
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
        <SelectTrigger id="automation-template" aria-label="Template" className="w-full">
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
        <SelectTrigger id="automation-from" aria-label="From" className="w-full">
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
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !name.trim() || !listId || !templateId || !fromEmail}>
          Create
        </Button>
      </div>
    </form>
  );
}
