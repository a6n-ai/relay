import { createFileRoute, redirect } from "@tanstack/react-router";
import { CreateDialog } from "../components/create-dialog";
import { NewWorkspaceForm } from "../components/new-workspace-form";
import { SignOutButton } from "../components/sign-out-button";
import { getShell } from "../console/shell.fns";

export const Route = createFileRoute("/no-workspace")({
  beforeLoad: async ({ location }) => {
    const shell = await getShell();
    if (!shell) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    if (shell.active) throw redirect({ to: "/" });
  },
  component: NoWorkspace,
});

function NoWorkspace() {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-lg font-medium">No workspace yet</h1>
      <p className="text-sm text-muted-foreground">Ask a workspace owner to add you to a workspace, or start your own.</p>
      <div>
        <CreateDialog trigger="New workspace" title="New workspace">{(done) => <NewWorkspaceForm done={done} />}</CreateDialog>
      </div>
      <div>
        <SignOutButton />
      </div>
    </main>
  );
}
