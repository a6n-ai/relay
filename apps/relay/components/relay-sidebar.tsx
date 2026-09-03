"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  FileTextIcon,
  KeyIcon,
  LayoutDashboardIcon,
  ListIcon,
  MailIcon,
  MailboxIcon,
  MessageCircleIcon,
  MegaphoneIcon,
  ScrollTextIcon,
  SettingsIcon,
  SmartphoneIcon,
  TagsIcon,
  UsersIcon,
  WebhookIcon,
  ZapIcon,
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
  SidebarSeparator,
} from "@foundry/ui/sidebar";
import { Button } from "@foundry/ui/button";
import { signOut } from "@/lib/auth/client";
import { RELAY_CHANNELS } from "@/components/ds/channels";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Your account is `/dashboard/account`; Team is `/dashboard/accounts`. */
  exact?: boolean;
};

const OVERVIEW: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboardIcon, exact: true },
  { href: "/dashboard/tenants", label: "Apps", icon: KeyIcon },
];

const OUTREACH: NavItem[] = [
  { href: "/dashboard/campaigns", label: "Campaigns", icon: MegaphoneIcon },
  { href: "/dashboard/lists", label: "People", icon: ListIcon },
  { href: "/dashboard/templates", label: "Templates", icon: FileTextIcon },
  { href: "/dashboard/automations", label: "Automations", icon: ZapIcon },
];

const ACTIVITY: NavItem[] = [
  { href: "/dashboard/logs", label: "Sends", icon: ScrollTextIcon },
  { href: "/dashboard/mailbox", label: "Mailbox", icon: MailboxIcon },
  { href: "/dashboard/webhooks", label: "Status updates", icon: WebhookIcon },
];

const SETUP: NavItem[] = [
  { href: "/dashboard/settings/email", label: "Email sending", icon: MailIcon },
  { href: "/dashboard/settings/tags", label: "Tags", icon: TagsIcon },
  { href: "/dashboard/accounts", label: "Team", icon: UsersIcon },
  { href: "/dashboard/account", label: "Your account", icon: SettingsIcon, exact: true },
];

const CHANNEL_ICONS = {
  email: MailIcon,
  sms: SmartphoneIcon,
  whatsapp: MessageCircleIcon,
  in_app: FileTextIcon,
} as const;

function pathActive(pathname: string, item: NavItem): boolean {
  if (item.exact || item.href === "/dashboard") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: readonly NavItem[];
  pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={pathActive(pathname, item)}>
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
  );
}

export function RelaySidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <Sidebar>
      <SidebarHeader className="gap-1 px-4 py-4">
        <p className="text-sm font-semibold tracking-tight">Relay</p>
        <p className="text-xs text-sidebar-foreground/60">Messages for your apps</p>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label="Overview" items={OVERVIEW} pathname={pathname} />
        <NavGroup label="Outreach" items={OUTREACH} pathname={pathname} />
        <NavGroup label="Activity" items={ACTIVITY} pathname={pathname} />
        <SidebarGroup>
          <SidebarGroupLabel>How you reach people</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {RELAY_CHANNELS.map((ch) => {
                const Icon = CHANNEL_ICONS[ch.key];
                const href = ch.href;
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <SidebarMenuItem key={ch.key}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link href={href}>
                        <Icon />
                        <span>{ch.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <NavGroup label="Setup" items={SETUP} pathname={pathname} />
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
