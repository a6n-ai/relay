"use client";

import Link from "next/link";
import { SidebarFooter } from "@foundry/ui/sidebar";
import { Button } from "@foundry/ui/button";
import { signOut } from "@/lib/auth/client";
import { ThemeSwitcher } from "@/components/ds/theme-switcher";

/** Sidebar footer shared by the app and settings sidebars: theme, account link, sign out. */
export function RelaySidebarFooter({ email }: { email: string }) {
  return (
    <SidebarFooter className="gap-3 p-3 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center justify-between gap-2 max-md:hidden">
        <span className="text-xs text-muted-foreground">Theme</span>
        <ThemeSwitcher />
      </div>
      <Link
        href="/dashboard/settings/account"
        prefetch={false}
        className="truncate font-mono text-xs text-sidebar-foreground underline-offset-4 hover:underline"
      >
        {email}
      </Link>
      <Button
        variant="outline"
        size="sm"
        className="bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={() =>
          signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/login"; } } })
        }
      >
        Sign out
      </Button>
    </SidebarFooter>
  );
}
