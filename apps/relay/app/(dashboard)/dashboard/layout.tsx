import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CrmShell } from "@foundry/crm";
import { getSession } from "@/lib/auth/session";
import { RelayBreadcrumbs, ThemeSwitcher } from "@/components/ds";
import { RelaySidebar } from "@/components/relay-sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return (
    <CrmShell
      sidebar={<RelaySidebar email={session.user.email} />}
      breadcrumbs={<RelayBreadcrumbs />}
      actions={<ThemeSwitcher />}
    >
      <div className="style-lyra dashboard-canvas -m-6 min-h-[calc(100svh-3.5rem)] p-6">
        {children}
      </div>
    </CrmShell>
  );
}
