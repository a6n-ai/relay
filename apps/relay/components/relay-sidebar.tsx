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
} from "@foundry/ui/sidebar";
import { Button } from "@foundry/ui/button";
import { signOut } from "@/lib/auth/client";
import { NAV_GROUPS, activeNavHref } from "@/components/ds/nav";

export function RelaySidebar({ email }: { email: string }) {
  const active = activeNavHref(usePathname());
  return (
    <Sidebar>
      <SidebarHeader className="gap-1 px-4 py-4">
        <p className="text-[15px] font-semibold tracking-tight">Relay</p>
        <p className="text-xs text-muted-foreground">Messages for your apps</p>
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
                      <Link href={item.href} prefetch={false}>
                        <item.icon />
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
      <SidebarFooter className="gap-3 p-3">
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
