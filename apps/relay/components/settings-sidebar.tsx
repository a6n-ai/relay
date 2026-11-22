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
  SidebarTrigger,
} from "@foundry/ui/sidebar";
import { visibleSettingsNav } from "@/components/ds/settings-nav";
import { RelaySidebarFooter } from "@/components/relay-sidebar-footer";

// Colour and padding ease together; the primitives' own width/height transitions are kept.
const PRESS = "transition-[width,height,padding,background-color,color] duration-100";

/** Replaces the app sidebar on /dashboard/settings pages (Linear-style settings nav). */
export function SettingsSidebar({
  email,
  allowed,
  apps,
  platformStaff = false,
}: {
  email: string;
  /** `permKey`s the caller holds, resolved on the server (`navAccess`). */
  allowed: readonly string[];
  apps: readonly { publicId: string; name: string }[];
  /** a6n platform staff (`super_admin`) also see Organization → Clients. */
  platformStaff?: boolean;
}) {
  const pathname = usePathname();
  const groups = visibleSettingsNav(new Set(allowed), apps, pathname, platformStaff);
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="gap-2 px-2 pt-3 pb-2">
        <div className="flex flex-row items-center justify-between px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Link
            href="/dashboard"
            prefetch={false}
            className="rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors duration-100 group-data-[collapsible=icon]:hidden hover:text-foreground active:bg-sidebar-accent active:text-foreground"
          >
            ‹ Back to app
          </Link>
          <SidebarTrigger className="-mr-1 max-md:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={item.active}
                      className={PRESS}
                      render={<Link href={item.href} prefetch={false} aria-current={item.active ? "page" : undefined} />}
                    >
                      <item.icon aria-hidden />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.children ? (
                      // Height and opacity share one 200ms ease in and out. Reduced motion keeps the cross-fade and drops the height move.
                      <div
                        inert={!item.open}
                        className={`grid ease-soft duration-200 motion-reduce:transition-opacity ${
                          item.open
                            ? "grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity]"
                            : "grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity]"
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <SidebarMenuSub>
                            {item.children.map((child) => (
                              <SidebarMenuSubItem key={child.href}>
                                <SidebarMenuSubButton
                                  isActive={child.active}
                                  className={PRESS}
                                  render={<Link href={child.href} prefetch={false} aria-current={child.active ? "page" : undefined} />}
                                >
                                  <child.icon aria-hidden />
                                  <span>{child.label}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </div>
                      </div>
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
