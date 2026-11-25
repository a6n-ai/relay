import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { ResourceTable } from "../../components/resource-table";
import { runAction } from "../../components/run-action";
import { ViewHeader } from "../../components/view-header";
import { fetchWorkspaces, setWorkspaceInviteCapFn, setWorkspaceQuotaFn, setWorkspaceRegionFn, setWorkspaceStatusFn } from "../../console/admin.fns";
import { SES_REGIONS } from "../../core/ses-regions";

export const Route = createFileRoute("/_app/admin")({
  loader: async () => {
    try {
      return await fetchWorkspaces();
    } catch (err) {
      if (err instanceof Error && err.message === "not found") throw notFound();
      throw err;
    }
  },
  component: AdminPage,
});

function NumberForm({
  id,
  label,
  value: initial,
  min,
  max,
  error,
  onSave,
}: {
  id: string;
  label: string;
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
    <form onSubmit={submit} className="flex items-center gap-2">
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-28"
      />
      <Button type="submit" size="sm" variant="outline">
        Save
      </Button>
    </form>
  );
}

function AdminPage() {
  const workspaces = Route.useLoaderData();
  const router = useRouter();
  const run = (action: () => Promise<unknown>, success: string) => runAction(action, success, () => router.invalidate());

  return (
    <>
      <ViewHeader title="Admin" />
      <p className="border-b px-4 py-3 text-sm text-muted-foreground">
        Suspended workspaces can't send or change settings. They still receive mail.
      </p>
      <ResourceTable
        rows={workspaces}
        rowKey={(w) => w.id}
        empty="No workspaces yet."
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
          {
            header: "Status",
            cell: (w) =>
              w.status === "suspended" ? (
                <div>
                  <Badge variant="danger">Suspended</Badge>
                  {w.suspendedAt && w.inboundUntil && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Suspended {new Date(w.suspendedAt).toLocaleDateString("en-CA")} · inbound until{" "}
                      {new Date(w.inboundUntil).toLocaleDateString("en-CA")}
                    </div>
                  )}
                </div>
              ) : (
                <Badge variant="success">Active</Badge>
              ),
          },
          { header: "Members", cell: (w) => w.members },
          { header: "Sent this month", cell: (w) => w.sentThisMonth },
          {
            header: "SES region",
            cell: (w) => (
              <Select
                value={w.sesRegion ?? ""}
                onValueChange={(region) =>
                  region && region !== w.sesRegion
                    ? run(() => setWorkspaceRegionFn({ data: { workspaceId: w.id, region } }), "Region saved")
                    : undefined
                }
              >
                <SelectTrigger aria-label={`SES region for ${w.name}`} className="h-8 w-36">
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
            ),
          },
          {
            header: "Monthly quota (0 is unlimited)",
            cell: (w) => (
              <NumberForm
                key={`${w.id}-${w.quota}`}
                id={`quota-${w.id}`}
                label="Monthly quota"
                value={w.quota}
                min={0}
                error="Quota must be a whole number, 0 or more"
                onSave={(quota) =>
                  run(() => setWorkspaceQuotaFn({ data: { workspaceId: w.id, quota } }), "Quota saved")
                }
              />
            ),
          },
          {
            header: "Invites/day",
            cell: (w) => (
              <NumberForm
                key={`${w.id}-${w.invitesPerDay}`}
                id={`invites-${w.id}`}
                label="Invites per day"
                value={w.invitesPerDay}
                min={1}
                max={10000}
                error="Invites per day must be a whole number from 1 to 10000"
                onSave={(cap) =>
                  run(() => setWorkspaceInviteCapFn({ data: { workspaceId: w.id, cap } }), "Invites per day saved")
                }
              />
            ),
          },
          {
            header: "Access",
            cell: (w) => {
              const suspend = w.status !== "suspended";
              return (
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
                      () =>
                        setWorkspaceStatusFn({ data: { workspaceId: w.id, status: suspend ? "suspended" : "active" } }),
                      suspend ? "Workspace suspended" : "Workspace resumed",
                    )
                  }
                />
              );
            },
          },
        ]}
      />
    </>
  );
}
