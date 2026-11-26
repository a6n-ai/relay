import { Toaster } from "@foundry/ui/toast";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { AppError } from "../components/denied-state";
import { Landing } from "../components/landing/landing";
import { FindPalette } from "../components/shell/find-palette";
import { getShell } from "../console/shell.fns";
import { isPublicWhenSignedOut } from "../lib/public-path";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const shell = await getShell();
    // `never` keeps child routes typed with a non-null shell.
    if (!shell && isPublicWhenSignedOut(location.pathname)) return { shell: null as never, landing: true };
    if (!shell) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    // The platform admin page covers every workspace, so an admin with no membership can still open it.
    const platformPage = shell.platformAdmin && location.pathname === "/admin";
    if (!shell.active && !platformPage) throw redirect({ to: "/no-workspace" });
    return { shell, landing: false };
  },
  component: AppLayout,
  errorComponent: AppError,
});

function AppLayout() {
  const { shell, landing } = Route.useRouteContext();
  if (!shell || landing) return <Landing />;
  return (
    <>
      <AppShell shell={shell} find={<FindPalette shell={shell} />}>
        <Outlet />
      </AppShell>
      <Toaster />
    </>
  );
}
