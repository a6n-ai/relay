import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AuthButton, AuthCard, AuthText } from "../components/auth-card";
import { useSignOut } from "../components/shell/sign-out";
import { getShell } from "../console/shell.fns";
import { signInRedirect } from "../components/lib/sign-in-redirect";

export const Route = createFileRoute("/no-workspace")({
  beforeLoad: async ({ location }) => {
    const shell = await getShell();
    if (!shell) throw signInRedirect(location);
    if (shell.active) throw redirect({ to: "/" });
    return { shell };
  },
  component: NoWorkspace,
});

function NoWorkspace() {
  const { shell } = Route.useRouteContext();
  const signOut = useSignOut();
  return (
    <AuthCard title="No workspace yet">
      <AuthText>Ask a workspace owner to add you to a workspace, or start your own.</AuthText>
      <div className="flex flex-col gap-3">
        <AuthButton render={<Link to="/workspaces/new" />}>New workspace</AuthButton>
        {shell.platformAdmin ? (
          <AuthButton variant="outline" render={<Link to="/admin" />}>
            Open platform admin
          </AuthButton>
        ) : null}
        <AuthButton variant="ghost" onClick={signOut}>
          Sign out
        </AuthButton>
      </div>
    </AuthCard>
  );
}
