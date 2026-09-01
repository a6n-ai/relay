"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GlobeIcon,
  InboxIcon,
  KeyIcon,
  LayoutDashboardIcon,
  MailIcon,
  MessageCircleIcon,
  MegaphoneIcon,
  ScrollTextIcon,
  SettingsIcon,
  SmartphoneIcon,
  UsersIcon,
} from "lucide-react";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@foundry/ui/sidebar";
import { Button } from "@foundry/ui/button";
import { signOut } from "@/lib/auth/client";
import { RELAY_CHANNELS } from "@/components/ds/channels";

const PRIMARY = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/dashboard/tenants", label: "Tenants", icon: KeyIcon },
  { href: "/dashboard/domains", label: "Domains", icon: GlobeIcon },
  { href: "/dashboard/sending", label: "SMTP", icon: MailIcon },
  { href: "/dashboard/logs", label: "Outbox", icon: ScrollTextIcon },
  { href: "/dashboard/templates", label: "Templates", icon: InboxIcon },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: MegaphoneIcon },
] as const;

const CHANNEL_ICONS = {
  email: MailIcon,
  sms: SmartphoneIcon,
  whatsapp: MessageCircleIcon,
  in_app: InboxIcon,
} as const;

function pathActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function RelaySidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <Sidebar>
      <SidebarHeader className="gap-1 px-4 py-4">
        <p className="text-sm font-semibold tracking-tight">Relay</p>
        <p className="text-xs text-sidebar-foreground/60">Operator workspace</p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {PRIMARY.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathActive(pathname, item.href)}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Channels</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuSub>
                  {RELAY_CHANNELS.map((ch) => {
                    const Icon = CHANNEL_ICONS[ch.key];
                    return (
                      <SidebarMenuSubItem key={ch.key}>
                        <SidebarMenuSubButton asChild isActive={pathActive(pathname, ch.href)}>
                          <Link href={ch.href}>
                            <Icon />
                            <span>{ch.label}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Access</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathActive(pathname, "/dashboard/accounts")}>
                  <Link href="/dashboard/accounts">
                    <UsersIcon />
                    <span>Operators</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/dashboard/account"}>
                  <Link href="/dashboard/account">
                    <SettingsIcon />
                    <span>Account</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="gap-3 p-3">
        <Link
          href="/dashboard/account"
          className="truncate font-mono text-xs text-sidebar-foreground/70 hover:text-sidebar-accent-foreground"
        >
          {email}
        </Link>
        <Button
          variant="outline"
          size="sm"
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
