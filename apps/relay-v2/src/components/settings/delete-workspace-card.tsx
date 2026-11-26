import { useNavigate } from "@tanstack/react-router";
import { DangerCard } from "../page/danger-card";
import { useCan } from "../use-can";
import { deleteWorkspaceFn } from "../../console/workspaces.fns";

export function DeleteWorkspaceCard({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const canDelete = useCan({ organization: ["delete"] });
  if (!canDelete) return null;
  return (
    <DangerCard
      title="Delete workspace"
      description="Deletes the workspace, its members and invites. It can't be undone."
      buttonLabel="Delete workspace"
      confirmTitle="Delete this workspace?"
      typed={slug}
      onConfirm={async () => {
        await deleteWorkspaceFn({ data: { slug } });
        // The shell moves a stale active workspace to the next membership, or to /no-workspace.
        await navigate({ to: "/", reloadDocument: true });
      }}
    />
  );
}
