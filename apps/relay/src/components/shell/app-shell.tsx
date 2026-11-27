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
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@foundry/ui/sidebar";
import { Link, useLocation, useSearch } from "@tanstack/react-router";
import { Fragment, type ReactNode, useEffect } from "react";
import { activeNav, type NavGroup, type NavItem, visibleNav } from "./nav";
import { usePageOf } from "./page-data";
import { navSearch } from "./scope";
import { UserMenu } from "./user-menu";
import { SuspendedBanner } from "./suspended-banner";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { type Shell } from "../../shared/views";
import { isSuspended } from "../../shared/limits";

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

function LeafItem({ item, active }: { item: NavItem; active: Active }) {
  const current = active?.item === item.id;
  const appId = useAppId();
  const pageOf = usePageOf();
  const first = item.children?.[0] ?? item;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={current}
        tooltip={item.label}
        render={<Link to={first.to} search={navSearch(first.to, first.search, appId, pageOf)} aria-current={current ? "page" : undefined} />}
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
                {group.items.map((item) => (
                  <LeafItem key={item.id} item={item} active={active} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </Fragment>
      ))}
    </>
  );
}

export function AppShell({ shell, find, children }: { shell: Shell; find?: ReactNode; children: ReactNode }) {
  const { pathname, search } = useLocation();
  const groups = visibleNav(shell.active?.roles ?? [], shell.platformAdmin, shell.active !== null, usePageOf());
  const active = activeNav(pathname, search as Record<string, unknown>);
  return (
    <SidebarProvider>
      <CloseOnNavigate />
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <WorkspaceSwitcher active={shell.active} workspaces={shell.workspaces} />
          {find}
        </SidebarHeader>
        <SidebarContent className="overflow-x-hidden">
          <Groups groups={groups} active={active} />
        </SidebarContent>
        <SidebarFooter>
          <UserMenu email={shell.user.email} name={shell.user.name} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        {isSuspended(shell.active?.status) ? <SuspendedBanner /> : null}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,72rem)_minmax(0,1fr)] [&>:not(header)]:col-start-2 [&>:not(header)]:min-w-0 [&>header]:col-span-full">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
