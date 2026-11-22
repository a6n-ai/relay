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
  SidebarSeparator,
  SidebarTrigger,
} from "@foundry/ui/sidebar";
import { Building2Icon } from "lucide-react";
import { NAV_GROUPS, activeNavHref, isUnder, permKey, type Perm } from "@/components/ds/nav";
import { iconColorVar } from "@/components/ds/icon-color";
import { AppSwitcher } from "@/components/app-switcher";
import { RelaySidebarFooter } from "@/components/relay-sidebar-footer";
import { SettingsSidebar } from "@/components/settings-sidebar";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

export function RelaySidebar({
  email,
  showClients = false,
  allowed,
  apps,
}: {
  email: string;
  /** a6n platform staff (`super_admin`) — Clients sits in Organization. */
  showClients?: boolean;
  /** `permKey`s the caller holds, resolved on the server (`navAccess`). */
  allowed: readonly string[];
  /** The active workspace's apps, for the settings sidebar's Apps group. */
  apps: readonly { publicId: string; name: string }[];
}) {
  const pathname = usePathname();
  if (isUnder(pathname, "/dashboard/settings")) {
    return <SettingsSidebar email={email} allowed={allowed} apps={apps} />;
  }
  const active = activeNavHref(pathname);
  const granted = new Set(allowed);
  const shows = (perm?: Perm) => !perm || granted.has(permKey(perm));
  const navGroups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => shows(i.perm)) })).filter(
    (g) => g.items.length > 0,
  );
  const clientsActive = isUnder(pathname, "/dashboard/platform");
  // Inset: the sidebar sits on the canvas and the page is a lifted panel (Linear's inverted-L chrome).
  return (
    <Sidebar variant="inset" collapsible="icon">
      {/* No top bar on desktop (Linear): the collapse toggle lives here, the theme switch in the footer. */}
      <SidebarHeader className="gap-2 px-2 pt-3 pb-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <div className="flex flex-row items-center justify-between px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <p className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">Relay</p>
          <SidebarTrigger className="-mr-1 max-md:hidden" />
        </div>
        <div className="flex flex-col gap-0.5 group-data-[collapsible=icon]:hidden">
          <WorkspaceSwitcher />
          <AppSwitcher />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group, i) => (
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
        {showClients ? (
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground">
            Organization
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={clientsActive}>
                  <Link
                    href="/dashboard/platform"
                    prefetch={false}
                    aria-current={clientsActive ? "page" : undefined}
                  >
                    <Building2Icon style={{ color: iconColorVar("purple") }} />
                    <span>Clients</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        ) : null}
      </SidebarContent>
      <SidebarSeparator />
      <RelaySidebarFooter email={email} />
    </Sidebar>
  );
}
