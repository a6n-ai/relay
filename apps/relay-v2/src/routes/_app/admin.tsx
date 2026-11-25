import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@foundry/ui/sheet";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { BuildingIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { EmptyState } from "../../components/page/empty-state";
import { SettingsCard } from "../../components/page/settings-card";
import { SearchInput, Toolbar } from "../../components/page/toolbar";
import { TableSkeleton } from "../../components/page/table-skeleton";
import { ResourceTable } from "../../components/resource-table";
import { runAction } from "../../components/run-action";
import { PageHeader } from "../../components/shell/page-header";
import { fetchWorkspaces, setWorkspaceInviteCapFn, setWorkspaceQuotaFn, setWorkspaceRegionFn, setWorkspaceStatusFn } from "../../console/admin.fns";
import { SES_REGIONS } from "../../core/ses-regions";
import { formatDate } from "../../lib/format-date";

type AdminSearch = { ws?: string };

export const Route = createFileRoute("/_app/admin")({
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    ws: typeof search.ws === "string" && search.ws ? search.ws : undefined,
  }),
  loader: async () => {
    try {
      return await fetchWorkspaces();
    } catch (err) {
      if (err instanceof Error && err.message === "not found") throw notFound();
      throw err;
    }
  },
  pendingComponent: () => <TableSkeleton columns={5} />,
  component: AdminPage,
});

type Workspace = Awaited<ReturnType<typeof fetchWorkspaces>>[number];

function StatusCell({ w }: { w: Workspace }) {
  return w.status === "suspended" ? (
    <div>
      <Badge variant="danger">Suspended</Badge>
      {w.suspendedAt && w.inboundUntil && (
        <div className="mt-1 text-xs text-muted-foreground">
          Suspended {formatDate(w.suspendedAt)} · inbound until {formatDate(w.inboundUntil)}
        </div>
      )}
    </div>
  ) : (
    <Badge variant="success">Active</Badge>
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
  onSave,
}: {
  id: string;
  title: string;
  description: string;
  value: number;
  min: number;
  max?: number;
  error: string;
  onSave: (value: number) => void;
}) {
  const [value, setValue] = useState(String(initial));

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = Number(value);
    // Number("") is 0, which would silently make the workspace unlimited.
    if (value.trim() === "" || !Number.isInteger(next) || next < min || (max !== undefined && next > max)) {
      toast.error(error);
      return;
    }
    onSave(next);
  }

  return (
    <SettingsCard
      title={title}
      description={description}
      action={
        <Button type="submit" form={id} size="sm" variant="outline">
          Save
        </Button>
      }
    >
      <form id={id} onSubmit={submit}>
        <Label htmlFor={`${id}-input`} className="sr-only">
          {title}
        </Label>
        <Input
          id={`${id}-input`}
          type="number"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-40"
        />
      </form>
    </SettingsCard>
  );
}

function ManageSheet({ w, run }: { w: Workspace; run: (action: () => Promise<unknown>, success: string) => void }) {
  const [region, setRegion] = useState(w.sesRegion ?? "");
  const suspend = w.status !== "suspended";
  return (
    <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
      <StatusCell w={w} />
      <SettingsCard
        title="Region"
        description="Where this workspace sends from."
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={!region || region === w.sesRegion}
            onClick={() => run(() => setWorkspaceRegionFn({ data: { workspaceId: w.id, region } }), "Region saved")}
          >
            Save
          </Button>
        }
      >
        <Select value={region} onValueChange={(r) => setRegion(r ?? "")}>
          <SelectTrigger aria-label={`SES region for ${w.name}`} className="w-40">
            <SelectValue placeholder="Default" />
          </SelectTrigger>
          <SelectContent>
            {SES_REGIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsCard>
      <NumberCard
        key={`quota-${w.quota}`}
        id={`quota-${w.id}`}
        title="Monthly quota"
        description="Messages per month. 0 is unlimited."
        value={w.quota}
        min={0}
        error="Quota must be a whole number, 0 or more"
        onSave={(quota) => run(() => setWorkspaceQuotaFn({ data: { workspaceId: w.id, quota } }), "Quota saved")}
      />
      <NumberCard
        key={`invites-${w.invitesPerDay}`}
        id={`invites-${w.id}`}
        title="Invites per day"
        description="Team invitations this workspace can send each day."
        value={w.invitesPerDay}
        min={1}
        max={10000}
        error="Invites per day must be a whole number from 1 to 10000"
        onSave={(cap) => run(() => setWorkspaceInviteCapFn({ data: { workspaceId: w.id, cap } }), "Invites per day saved")}
      />
      <SettingsCard
        title={suspend ? "Suspend workspace" : "Resume workspace"}
        description={
          suspend
            ? "Suspended workspaces can't send or change settings. They still receive mail."
            : "The workspace can send and change settings again."
        }
        tone={suspend ? "danger" : "default"}
        action={
          <ConfirmDialog
            trigger={suspend ? "Suspend" : "Resume"}
            title={suspend ? `Suspend ${w.name}?` : `Resume ${w.name}?`}
            description={
              suspend
                ? "Suspended workspaces can't send or change settings. They still receive mail."
                : "The workspace can send and change settings again."
            }
            confirmLabel={suspend ? "Suspend" : "Resume"}
            onConfirm={() =>
              run(
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
  const { ws } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin" });
  const router = useRouter();
  const [query, setQuery] = useState("");
  const run = (action: () => Promise<unknown>, success: string) => runAction(action, success, () => router.invalidate());
  const q = query.trim().toLowerCase();
  const rows = q ? workspaces.filter((w) => w.name.toLowerCase().includes(q) || w.slug.toLowerCase().includes(q)) : workspaces;
  const selected = ws ? workspaces.find((w) => w.id === ws) : undefined;

  return (
    <>
      <PageHeader crumbs={[{ label: "Admin" }]} />
      <Toolbar search={<SearchInput value={query} onChange={setQuery} placeholder="Search workspaces" />} />
      <ResourceTable
        rows={rows}
        rowKey={(w) => w.id}
        rowHref={(w) => ({ to: "/admin", search: { ws: w.id } })}
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
                <div className="text-xs text-muted-foreground">{w.slug}</div>
              </div>
            ),
          },
          { header: "Status", cell: (w) => <StatusCell w={w} /> },
          { header: "Members", numeric: true, cell: (w) => w.members },
          { header: "Sent this month", numeric: true, cell: (w) => w.sentThisMonth },
          { header: "Region", cell: (w) => w.sesRegion ?? "—" },
        ]}
      />
      <Sheet
        open={Boolean(selected)}
        modal={false}
        onOpenChange={(open) => {
          if (!open) void navigate({ search: {} });
        }}
      >
        <SheetContent className="data-[side=right]:sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>Manage {selected.name}</SheetTitle>
                <SheetDescription>{selected.slug}</SheetDescription>
              </SheetHeader>
              <ManageSheet key={selected.id} w={selected} run={run} />
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
