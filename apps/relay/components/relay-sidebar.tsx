"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from "@foundry/ui/sidebar";
import { Button } from "@foundry/ui/button";
import { signOut } from "@/lib/auth/client";
import { NAV_GROUPS, activeNavHref } from "@/components/ds/nav";
import { iconColorVar } from "@/components/ds/icon-color";
import { ThemeSwitcher } from "@/components/ds/theme-switcher";

export function RelaySidebar({ email }: { email: string }) {
  const active = activeNavHref(usePathname());
  // Inset: the sidebar sits on the canvas and the page is a lifted panel (Linear's inverted-L chrome).
  return (
    <Sidebar variant="inset" collapsible="icon">
      {/* No top bar on desktop (Linear): the collapse toggle lives here, the theme switch in the footer. */}
      <SidebarHeader className="flex-row items-center justify-between px-4 pt-3 pb-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
        <p className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">Relay</p>
        <SidebarTrigger className="-mr-1 max-md:hidden" />
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group, i) => (
          <SidebarGroup key={group.label ?? i}>
            {group.label ? (
              <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground">{group.label}</SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={item.href === active}>
                      <Link href={item.href} prefetch={false} aria-current={item.href === active ? "page" : undefined}>
                        <item.icon style={{ color: iconColorVar(item.color) }} />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="gap-3 p-3 group-data-[collapsible=icon]:hidden">
        <div className="flex items-center justify-between gap-2 max-md:hidden">
          <span className="text-xs text-muted-foreground">Theme</span>
          <ThemeSwitcher />
        </div>
        <Link
          href="/dashboard/account"
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
    </Sidebar>
  );
}
