import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@foundry/ui/sidebar";
import { Link, useLocation } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import AppWindow from "lucide-react/icons/app-window";
import Globe from "lucide-react/icons/globe";
import LayoutDashboard from "lucide-react/icons/layout-dashboard";
import List from "lucide-react/icons/list";
import Mail from "lucide-react/icons/mail";
import Megaphone from "lucide-react/icons/megaphone";
import Shield from "lucide-react/icons/shield";
import Users from "lucide-react/icons/users";
import type { ReactNode } from "react";
import type { Shell } from "../console/shell";
import { allows } from "../lib/auth/permissions";
import { SignOutButton } from "./sign-out-button";
import { SuspendedBanner } from "./suspended-banner";
import { WorkspaceSwitcher } from "./workspace-switcher";

export type NavItem = { to: string; label: string; icon: LucideIcon; need?: Record<string, string[]> };

const NAV: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/apps", label: "Apps", icon: AppWindow },
  { to: "/messages", label: "Messages", icon: Mail, need: { log: ["read"] } },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone, need: { campaign: ["read"] } },
  { to: "/lists", label: "Lists", icon: List, need: { list: ["read"] } },
  { to: "/domains", label: "Domains", icon: Globe, need: { sending: ["read"] } },
  { to: "/members", label: "Members", icon: Users },
];
const ADMIN_NAV: NavItem = { to: "/admin", label: "Admin", icon: Shield };

export function AppShell({ shell, children }: { shell: Shell; children: ReactNode }) {
  const { pathname } = useLocation();
  const roles = shell.active?.roles ?? [];
  const visible = NAV.filter((item) => !item.need || allows(roles, item.need));
  const items = shell.platformAdmin ? [...visible, ADMIN_NAV] : visible;
  const isCurrent = (to: string) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`));
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <WorkspaceSwitcher active={shell.active} workspaces={shell.workspaces} />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={isCurrent(item.to)}
                      render={<Link to={item.to} aria-current={isCurrent(item.to) ? "page" : undefined} />}
                    >
                      <item.icon />
                      {item.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <p className="truncate px-2 text-xs text-muted-foreground">{shell.user.email}</p>
          <SignOutButton />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        {shell.active?.status === "suspended" ? <SuspendedBanner /> : null}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
