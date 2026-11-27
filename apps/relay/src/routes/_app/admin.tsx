import { Button } from "@foundry/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@foundry/ui/sheet";
import { createFileRoute, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { BuildingIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/page/confirm-dialog";
import { isNotFound } from "../../components/lib/scoped-load";
import { TextField } from "../../components/form/text-field";
import { ChoiceControl } from "../../components/form/choice-field";
import { type Facet } from "../../components/page/filters";
import { FilterMenu } from "../../components/page/filter-menu";
import { EmptyState } from "../../components/page/empty-state";
import { SettingsCard } from "../../components/page/settings-card";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { useUrlFilter } from "../../components/page/use-url-filter";
import { ListSkeleton } from "../../components/page/page-skeleton";
import { ResourceTable } from "../../components/page/resource-table";
import { confirmAction, runAction } from "../../components/lib/run-action";
import { PageHeader } from "../../components/shell/page-header";
import { fetchWorkspaces, setWorkspaceInviteCapFn, setWorkspaceQuotaFn, setWorkspaceRegionFn, setWorkspaceStatusFn } from "../../console/admin.fns";
import { SES_REGIONS } from "../../shared/regions";
import { formatDate } from "../../components/lib/format-date";
import { Hint } from "../../components/form/text";
import { StatusBadge } from "../../components/page/status-badge";
import { isSuspended, MAX_INVITES_PER_DAY, WORKSPACE_STATUSES, type WorkspaceStatus } from "../../shared/limits";
import { oneOf, str, untyped } from "../../components/lib/route-search";

type AdminSearch = { ws?: string; q?: string; status?: WorkspaceStatus };

const STATUS_FACET: Facet = {
  key: "status",
  label: "Status",
  options: [
    { value: "active", label: "Active" },
    { value: "suspended", label: "Suspended" },
  ],
};


export const Route = createFileRoute("/_app/admin")({
  staticData: { title: "Admin", copy: "Every workspace on this Relay.", allowsNoWorkspace: "platform" },
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    ws: str(search.ws),
    q: str(search.q),
    status: oneOf(WORKSPACE_STATUSES, search.status),
  }),
  loader: async () => {
    try {
      return await fetchWorkspaces();
    } catch (err) {
      if (isNotFound(err)) throw notFound();
      throw err;
    }
  },
  pendingComponent: () => <ListSkeleton columns={7} search filter />,
  component: AdminPage,
});

type Workspace = Awaited<ReturnType<typeof fetchWorkspaces>>[number];

function StatusCell({ w }: { w: Workspace }) {
  return isSuspended(w.status) ? (
    <div>
      <StatusBadge status="suspended" />
      {w.suspendedAt && w.inboundUntil && (
        <div className="mt-1 text-xs text-muted-foreground">
          Suspended {formatDate(w.suspendedAt)} · inbound until {formatDate(w.inboundUntil)}
        </div>
      )}
    </div>
  ) : (
    <StatusBadge status="active" />
  );
}

function NumberCard({
  id,
  title,
  description,
  value: initial,
  min,
  max,
  error,
  unit,
  saveLabel,
  onSave,
}: {
  id: string;
  title: string;
  description: string;
  value: number;
  min: number;
  max?: number;
  error: string;
  unit: string;
  saveLabel: string;
  onSave: (value: number) => void;
}) {
  const [value, setValue] = useState(String(initial));
  const [invalid, setInvalid] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = Number(value);
    // Number("") is 0, which would silently make the workspace unlimited.
    if (value.trim() === "" || !Number.isInteger(next) || next < min || (max !== undefined && next > max)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onSave(next);
  }

  const unchanged = value === String(initial);
  return (
    <SettingsCard
      title={title}
      description={description}
      disabledReason={unchanged ? "Change the value to save it." : undefined}
      action={
        <Button type="submit" form={id} variant="outline" disabled={unchanged}>
          {saveLabel}
        </Button>
      }
    >
      <form id={id} onSubmit={submit}>
        <TextField
          id={`${id}-input`}
          label={title}
          hideLabel
          type="number"
          min={min}
          max={max}
          step={1}
          suffix={unit}
          value={value}
          error={invalid ? error : null}
          onClearError={() => setInvalid(false)}
          onChange={(e) => setValue(e.target.value)}
        />
      </form>
    </SettingsCard>
  );
}

type Run = (action: () => Promise<unknown>, success: string) => void;

function ManageSheet({ w, run, confirm }: { w: Workspace; run: Run; confirm: (action: () => Promise<unknown>, success: string) => Promise<void> }) {
  const [region, setRegion] = useState(w.sesRegion ?? "");
  const suspend = !isSuspended(w.status);
  return (
    <div className="grid min-h-0 flex-1 auto-rows-max gap-4 overflow-y-auto px-4 pb-4">
      <StatusCell w={w} />
      <SettingsCard
        title="Region"
        description="Where this workspace sends from."
        action={
          <Button
            variant="outline"
            disabled={!region || region === w.sesRegion}
            onClick={() => run(() => setWorkspaceRegionFn({ data: { workspaceId: w.id, region } }), "Region saved")}
          >
            Save region
          </Button>
        }
      >
        <ChoiceControl
          id={`region-${w.id}`}
          mode="segmented"
          value={region}
          onChange={setRegion}
          options={SES_REGIONS.map((r) => ({ value: r.id, label: r.label }))}
        />
      </SettingsCard>
      <NumberCard
        key={`quota-${w.quota}`}
        id={`quota-${w.id}`}
        title="Monthly quota"
        description="Messages per month. 0 is unlimited."
        value={w.quota}
        min={0}
        error="Quota must be a whole number, 0 or more"
        unit="messages / month"
        saveLabel="Save quota"
        onSave={(quota) => run(() => setWorkspaceQuotaFn({ data: { workspaceId: w.id, quota } }), "Quota saved")}
      />
      <NumberCard
        key={`invites-${w.invitesPerDay}`}
        id={`invites-${w.id}`}
        title="Invites per day"
        description="Team invitations this workspace can send each day."
        value={w.invitesPerDay}
        min={1}
        max={MAX_INVITES_PER_DAY}
        error={`Invites per day must be a whole number from 1 to ${MAX_INVITES_PER_DAY}`}
        unit="invites / day"
        saveLabel="Save limit"
        onSave={(cap) => run(() => setWorkspaceInviteCapFn({ data: { workspaceId: w.id, cap } }), "Invites per day saved")}
      />
      <SettingsCard
        title="Suspension"
        description={
          suspend
            ? "Suspended workspaces can't send or change settings. They still receive mail."
            : "The workspace can send and change settings again."
        }
        action={
          <ConfirmDialog
            trigger={suspend ? "Suspend workspace" : "Resume workspace"}
            title={suspend ? `Suspend ${w.name}?` : `Resume ${w.name}?`}
            description={suspend ? "Members lose sending and settings until you resume it." : "Members can send and change settings again."}
            confirmLabel={suspend ? "Suspend workspace" : "Resume workspace"}
            destructive={suspend}
            onConfirm={() =>
              confirm(
                () => setWorkspaceStatusFn({ data: { workspaceId: w.id, status: suspend ? "suspended" : "active" } }),
                suspend ? "Workspace suspended" : "Workspace resumed",
              )
            }
          />
        }
      />
    </div>
  );
}

function AdminPage() {
  const workspaces = Route.useLoaderData();
  const search = Route.useSearch();
  const { ws, status } = search;
  const navigate = useNavigate({ from: "/admin" });
  const router = useRouter();
  const [query, setQuery] = useUrlFilter("q");
  const run = (action: () => Promise<unknown>, success: string) => runAction(action, success, () => router.invalidate());
  const confirm = (action: () => Promise<unknown>, success: string) => confirmAction(action, success, () => router.invalidate());
  const q = query.trim().toLowerCase();
  const byStatus = status ? workspaces.filter((w) => w.status === status) : workspaces;
  const rows = q ? byStatus.filter((w) => w.name.toLowerCase().includes(q) || w.slug.toLowerCase().includes(q)) : byStatus;
  const selected = ws ? workspaces.find((w) => w.id === ws) : undefined;

  return (
    <>
      <PageHeader />
      <Toolbar
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search workspaces" />}
        filters={
          <FilterMenu
            facets={[STATUS_FACET]}
            value={search}
            onChange={(next) => void navigate({ search: next as AdminSearch })}
          />
        }
      />
      <ResourceTable
        rows={rows}
        rowKey={(w) => w.id}
        rowHref={(w) => ({ to: "/admin", search: (prev: Record<string, unknown>) => untyped({ ...prev, ws: w.id }) })}
        rowLabel={(w) => `Manage ${w.name}`}
        empty={
          <EmptyState
            icon={BuildingIcon}
            title={workspaces.length === 0 ? "No workspaces yet" : "No matching workspaces"}
            description={workspaces.length === 0 ? undefined : "Try a different name or slug."}
          />
        }
        columns={[
          {
            header: "Workspace",
            cell: (w) => (
              <div>
                <div>{w.name}</div>
                <Hint as="div" size="xs">{w.slug}</Hint>
              </div>
            ),
          },
          { header: "Status", cell: (w) => <StatusCell w={w} /> },
          { header: "Members", numeric: true, cell: (w) => w.members },
          { header: "Sent this month", secondary: true, numeric: true, cell: (w) => w.sentThisMonth },
          { header: "Region", secondary: true, cell: (w) => w.sesRegion ?? "—" },
          { header: "Quota", secondary: true, numeric: true, cell: (w) => (w.quota === 0 ? "Unlimited" : w.quota) },
          { header: "Invites/day", secondary: true, numeric: true, cell: (w) => w.invitesPerDay },
        ]}
      />
      <Sheet
        open={Boolean(selected)}
        modal={false}
        onOpenChange={(open) => {
          if (!open) void navigate({ search: (prev) => ({ ...prev, ws: undefined }) });
        }}
      >
        <SheetContent className="data-[side=right]:sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>Manage {selected.name}</SheetTitle>
                <SheetDescription>{selected.slug}</SheetDescription>
              </SheetHeader>
              <ManageSheet key={selected.id} w={selected} run={run} confirm={confirm} />
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
