import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AppError } from "../components/denied-state";
import { Landing } from "../components/landing/landing";
import { getShell } from "../console/shell.fns";
import { isPublicWhenSignedOut } from "../lib/public-path";

// Console code loads only for signed-in visitors, so the landing page ships none of it.
const ConsoleLayout = lazy(() => import("../components/console-layout"));

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const shell = await getShell();
    // `never` keeps child routes typed with a non-null shell.
    if (!shell && isPublicWhenSignedOut(location.pathname)) return { shell: null as never, landing: true };
    if (!shell) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    // The platform admin page covers every workspace, so an admin with no membership can still open it.
    const platformPage = shell.platformAdmin && location.pathname === "/admin";
    const newWorkspacePage = location.pathname === "/workspaces/new";
    if (!shell.active && !platformPage && !newWorkspacePage) throw redirect({ to: "/no-workspace" });
    return { shell, landing: false };
  },
  component: AppLayout,
  errorComponent: AppError,
});

function AppLayout() {
  const { shell, landing } = Route.useRouteContext();
  if (!shell || landing) return <Landing />;
  return (
    <Suspense fallback={null}>
      <ConsoleLayout shell={shell} />
    </Suspense>
  );
}
