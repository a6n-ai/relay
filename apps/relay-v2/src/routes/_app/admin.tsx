import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { ResourceTable } from "../../components/resource-table";
import { runAction } from "../../components/run-action";
import { ViewHeader } from "../../components/view-header";
import { fetchWorkspaces, setWorkspaceQuotaFn, setWorkspaceStatusFn } from "../../console/admin.fns";

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

function QuotaForm({ workspaceId, quota, onSave }: { workspaceId: string; quota: number; onSave: (quota: number) => void }) {
  const [value, setValue] = useState(String(quota));

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = Number(value);
    // Number("") is 0, which would silently make the workspace unlimited.
    if (value.trim() === "" || !Number.isInteger(next) || next < 0) {
      toast.error("Quota must be a whole number, 0 or more");
      return;
    }
    onSave(next);
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Label htmlFor={`quota-${workspaceId}`} className="sr-only">
        Monthly quota
      </Label>
      <Input
        id={`quota-${workspaceId}`}
        type="number"
        min={0}
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
            header: "Monthly quota (0 is unlimited)",
            cell: (w) => (
              <QuotaForm
                key={`${w.id}-${w.quota}`}
                workspaceId={w.id}
                quota={w.quota}
                onSave={(quota) =>
                  run(() => setWorkspaceQuotaFn({ data: { workspaceId: w.id, quota } }), "Quota saved")
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
