import { redirect } from "next/navigation";
import { ViewTransition, type ReactNode } from "react";
import { CrmShell } from "@foundry/crm";
import { getSession } from "@/lib/auth/session";
import { RelayBreadcrumbs } from "@/components/ds/relay-breadcrumbs";
import { ThemeSwitcher } from "@/components/ds/theme-switcher";
import { RelaySidebar } from "@/components/relay-sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return (
    <>
    {/* First focus stop: jumps past the sidebar's links straight to the page. */}
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
    >
      Skip to content
    </a>
    <CrmShell
      sidebar={<RelaySidebar email={session.user.email} />}
      breadcrumbs={<RelayBreadcrumbs />}
      actions={<ThemeSwitcher />}
    >
      <div id="main" tabIndex={-1} className="style-lyra dashboard-canvas -m-6 min-h-[calc(100svh-3.5rem)] p-6 outline-none">
        {/* Route changes crossfade the page body; the sidebar and header stay put. */}
        <ViewTransition>{children}</ViewTransition>
      </div>
    </CrmShell>
    </>
  );
}
