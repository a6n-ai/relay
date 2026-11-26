import { Button } from "@foundry/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ConfirmDialog } from "../confirm-dialog";
import { SettingsCard } from "../page/settings-card";
import { useCan } from "../use-can";
import { deleteWorkspaceFn } from "../../console/workspaces.fns";

export function DeleteWorkspaceCard({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const canDelete = useCan({ organization: ["delete"] });
  const [open, setOpen] = useState(false);
  if (!canDelete) return null;
  return (
    <>
      <SettingsCard
        tone="danger"
        title="Delete workspace"
        description="This deletes the workspace, its members and invites. It can't be undone."
        action={
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Delete workspace
          </Button>
        }
      />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this workspace?"
        description="This deletes the workspace, its members and invites. It can't be undone."
        confirmLabel="Delete workspace"
        typed={slug}
        onConfirm={async () => {
          await deleteWorkspaceFn({ data: { slug } });
          // The shell moves a stale active workspace to the next membership, or to /no-workspace.
          await navigate({ to: "/", reloadDocument: true });
        }}
      />
    </>
  );
}
