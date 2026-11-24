import { Toaster } from "@foundry/ui/toast";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { getShell } from "../console/shell.fns";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const shell = await getShell();
    if (!shell) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    // The platform admin page covers every workspace, so an admin with no membership can still open it.
    const platformPage = shell.platformAdmin && location.pathname === "/admin";
    if (!shell.active && !platformPage) throw redirect({ to: "/no-workspace" });
    return { shell };
  },
  component: AppLayout,
});

function AppLayout() {
  const { shell } = Route.useRouteContext();
  return (
    <>
      <AppShell shell={shell}>
        <Outlet />
      </AppShell>
      <Toaster />
    </>
  );
}
