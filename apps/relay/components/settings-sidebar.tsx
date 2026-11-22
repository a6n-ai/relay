"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@foundry/ui/sidebar";
import { visibleSettingsNav } from "@/components/ds/settings-nav";
import { RelaySidebarFooter } from "@/components/relay-sidebar-footer";

/** Replaces the app sidebar on /dashboard/settings pages (Linear-style settings nav). */
export function SettingsSidebar({
  email,
  allowed,
  apps,
}: {
  email: string;
  /** `permKey`s the caller holds, resolved on the server (`navAccess`). */
  allowed: readonly string[];
  apps: readonly { publicId: string; name: string }[];
}) {
  const pathname = usePathname();
  const groups = visibleSettingsNav(new Set(allowed), apps, pathname);
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="gap-2 px-2 pt-3 pb-2 group-data-[collapsible=icon]:hidden">
        <Link href="/dashboard" prefetch={false} className="px-2 text-[13px] text-muted-foreground hover:text-foreground">
          ‹ Back to app
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={item.active}>
                      <Link href={item.href} prefetch={false} aria-current={item.active ? "page" : undefined}>
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.children ? (
                      <SidebarMenuSub>
                        {item.children.map((child) => (
                          <SidebarMenuSubItem key={child.href}>
                            <SidebarMenuSubButton asChild isActive={child.active}>
                              <Link href={child.href} prefetch={false} aria-current={child.active ? "page" : undefined}>
                                <span>{child.label}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarSeparator />
      <RelaySidebarFooter email={email} />
    </Sidebar>
  );
}
