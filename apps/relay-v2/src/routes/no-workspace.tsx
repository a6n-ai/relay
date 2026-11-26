import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { AuthButton, AuthCard, AuthText } from "../components/auth-card";
import { CreateDialog } from "../components/create-dialog";
import { NewWorkspaceForm } from "../components/new-workspace-form";
import { useSignOut } from "../components/sign-out-button";
import { getShell } from "../console/shell.fns";

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
  const [open, setOpen] = useState(false);
  const signOut = useSignOut();
  return (
    <AuthCard title="No workspace yet">
      <AuthText>Ask a workspace owner to add you to a workspace, or start your own.</AuthText>
      <div className="flex flex-col gap-3">
        <AuthButton onClick={() => setOpen(true)}>New workspace</AuthButton>
        {shell.platformAdmin ? (
          <AuthButton variant="outline" render={<Link to="/admin" />}>
            Open platform admin
          </AuthButton>
        ) : null}
        <AuthButton variant="ghost" onClick={signOut}>
          Sign out
        </AuthButton>
      </div>
      <CreateDialog open={open} onOpenChange={setOpen} title="New workspace">
        {(done) => <NewWorkspaceForm done={done} />}
      </CreateDialog>
    </AuthCard>
  );
}
