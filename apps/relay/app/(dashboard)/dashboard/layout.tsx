import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CrmShell } from "@foundry/crm";
import { ensureActiveOrganization } from "@/lib/auth/ensure-active-org";
import { getSession } from "@/lib/auth/session";
import { ThemeSwitcher } from "@/components/ds/theme-switcher";
import { RelaySidebar } from "@/components/relay-sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  // Pick a workspace before any org-scoped page loads apps.
  await ensureActiveOrganization();
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
      sidebar={
        <RelaySidebar
          email={session.user.email}
          showClients={session.user.platformRole === "super_admin"}
        />
      }
      actions={<ThemeSwitcher />}
    >
      <div id="main" tabIndex={-1} className="style-lyra dashboard-canvas -m-6 min-h-[calc(100svh-3.5rem)] p-6 outline-none">
        {children}
      </div>
    </CrmShell>
    </>
  );
}
