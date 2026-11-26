import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@foundry/ui/sidebar";
import { Link, useLocation, useSearch } from "@tanstack/react-router";
import ChevronLeft from "lucide-react/icons/chevron-left";
import ChevronRight from "lucide-react/icons/chevron-right";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import type { Shell } from "../console/shell";
import { activeNav, type NavGroup, type NavItem, visibleNav } from "./shell/nav";
import { navSearch } from "./shell/scope";
import { UserMenu } from "./shell/user-menu";
import { SuspendedBanner } from "./suspended-banner";
import { WorkspaceSwitcher } from "./workspace-switcher";

type Active = { item: string; child?: string } | null;

function useAppId() {
  return (useSearch({ strict: false }) as { appId?: string }).appId;
}

function CloseOnNavigate() {
  const { setOpenMobile } = useSidebar();
  const href = useLocation({ select: (l) => l.href });
  useEffect(() => setOpenMobile(false), [href, setOpenMobile]);
  return null;
}

function ParentItem({ item, active }: { item: NavItem; active: Active }) {
  const current = active?.item === item.id;
  const pathname = useLocation().pathname;
  const [override, setOverride] = useState<boolean | null>(null);
  useEffect(() => setOverride(null), [current, pathname]);
  const open = override ?? current;
  const first = item.children?.[0];
  const appId = useAppId();
  return (
    <Collapsible open={open} onOpenChange={setOverride} render={<SidebarMenuItem />}>
      <SidebarMenuButton
        isActive={current}
        tooltip={item.label}
        render={<Link to={first?.to ?? item.to} search={navSearch(first?.to ?? item.to, first?.search, appId)} aria-current={current ? "page" : undefined} />}
      >
        <item.icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
      <CollapsibleTrigger render={<SidebarMenuAction aria-label={`Toggle ${item.label}`} />}>
        <ChevronRight className={open ? "rotate-90" : undefined} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {item.children?.map((child) => (
            <SidebarMenuSubItem key={child.id}>
              <SidebarMenuSubButton
                isActive={current && active?.child === child.id}
                render={<Link to={child.to} search={navSearch(child.to, child.search, appId)} />}
              >
                <span>{child.label}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LeafItem({ item, active }: { item: NavItem; active: Active }) {
  const current = active?.item === item.id;
  const appId = useAppId();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={current}
        tooltip={item.label}
        render={<Link to={item.to} search={navSearch(item.to, item.search, appId)} aria-current={current ? "page" : undefined} />}
      >
        <item.icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function Groups({ groups, active }: { groups: NavGroup[]; active: Active }) {
  return (
    <>
      {groups.map((group, i) => (
        <Fragment key={group.id}>
          {i > 0 ? <SidebarSeparator /> : null}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) =>
                  item.children ? <ParentItem key={item.id} item={item} active={active} /> : <LeafItem key={item.id} item={item} active={active} />,
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </Fragment>
      ))}
    </>
  );
}

function SettingsNav({ groups, active }: { groups: NavGroup[]; active: Active }) {
  const settings = groups.flatMap((g) => g.items).find((i) => i.id === "settings");
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link to="/" />}>
              <ChevronLeft />
              <span>Back</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {settings?.children?.map((child) => (
            <SidebarMenuItem key={child.id}>
              <SidebarMenuButton isActive={active?.child === child.id} render={<Link to={child.to} search={child.search} />}>
                <span>{child.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppShell({ shell, find, children }: { shell: Shell; find?: ReactNode; children: ReactNode }) {
  const { pathname, search } = useLocation();
  const groups = visibleNav(shell.active?.roles ?? [], shell.platformAdmin, shell.active !== null);
  const active = activeNav(pathname, search as Record<string, unknown>);
  const inSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  return (
    <SidebarProvider>
      <CloseOnNavigate />
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <WorkspaceSwitcher active={shell.active} workspaces={shell.workspaces} />
          {find}
        </SidebarHeader>
        <SidebarContent>
          {inSettings ? <SettingsNav groups={groups} active={active} /> : <Groups groups={groups} active={active} />}
        </SidebarContent>
        <SidebarFooter>
          <UserMenu email={shell.user.email} name={shell.user.name} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        {shell.active?.status === "suspended" ? <SuspendedBanner /> : null}
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
