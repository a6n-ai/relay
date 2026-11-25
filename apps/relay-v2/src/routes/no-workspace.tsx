import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AuthCard } from "../components/auth-card";
import { CreateDialog } from "../components/create-dialog";
import { NewWorkspaceForm } from "../components/new-workspace-form";
import { SignOutButton } from "../components/sign-out-button";
import { getShell } from "../console/shell.fns";
import { Hint } from "../components/page/text";

export const Route = createFileRoute("/no-workspace")({
  beforeLoad: async ({ location }) => {
    const shell = await getShell();
    if (!shell) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    if (shell.active) throw redirect({ to: "/" });
    return { shell };
  },
  component: NoWorkspace,
});

function NoWorkspace() {
  const { shell } = Route.useRouteContext();
  return (
    <AuthCard title="No workspace yet">
      <Hint>Ask a workspace owner to add you to a workspace, or start your own.</Hint>
      <div>
        <CreateDialog trigger="New workspace" title="New workspace">{(done) => <NewWorkspaceForm done={done} />}</CreateDialog>
      </div>
      {shell.platformAdmin ? (
        <div>
          <Link to="/admin" className="text-sm underline">
            Open platform admin
          </Link>
        </div>
      ) : null}
      <div>
        <SignOutButton />
      </div>
    </AuthCard>
  );
}
