import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { getShell } from "../console/shell.fns";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const shell = await getShell();
    if (!shell) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    if (!shell.active) throw redirect({ to: "/no-workspace" });
    return { shell };
  },
  component: AppLayout,
});

function AppLayout() {
  const { shell } = Route.useRouteContext();
  return (
    <AppShell shell={shell}>
      <Outlet />
    </AppShell>
  );
}
