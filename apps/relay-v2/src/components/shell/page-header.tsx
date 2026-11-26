import { SidebarTrigger } from "@foundry/ui/sidebar";
import { Link, useLocation, useRouteContext } from "@tanstack/react-router";
import ChevronLeft from "lucide-react/icons/chevron-left";
import { type ReactNode, useEffect } from "react";
import { PageTitle } from "../page/page-title";
import { AddNewMenu } from "./add-new";
import { sectionTabs } from "./nav";
import { PAGE_COPY } from "./page-copy";
import { isAppScoped } from "./scope";
import { ScopeSwitcher } from "./scope-switcher";
import { SectionTabs } from "./section-tabs";

export type Crumb = { label: string; to?: string; params?: Record<string, string>; search?: Record<string, unknown> };

export function PageHeader({ crumbs, badge, actions, description }: { crumbs: Crumb[]; badge?: ReactNode; actions?: ReactNode; description?: string }) {
  const { pathname, search } = useLocation();
  const { shell } = useRouteContext({ from: "/_app" });
  const appId = (search as { appId?: string }).appId;
  const last = crumbs.length - 1;
  const label = crumbs[last]?.label;
  const section = sectionTabs(shell.active?.roles ?? [], pathname, search as Record<string, unknown>);
  const title = section?.title ?? label;
  const tab = section?.tabs.find((t) => t.id === section.active)?.label;
  const parent = section?.title ? undefined : crumbs[last - 1];

  useEffect(() => {
    if (label) document.title = `${label} · Relay`;
  }, [label]);

  return (
    <>
      <header className="border-b">
        <div className="flex h-14 items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger size="icon" className="md:hidden" />
            {parent?.to ? (
              <Link
                aria-label={`Back to ${parent.label}`}
                to={parent.to as string}
                params={parent.params as never}
                search={parent.search as never}
                className="inline-flex h-9 items-center gap-1 rounded-md pr-3 pl-1.5 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft aria-hidden className="size-4" />
                {parent.label}
              </Link>
            ) : isAppScoped(pathname) ? (
              <ScopeSwitcher />
            ) : (
              <span className="truncate px-2 text-base font-medium">{shell.active?.name}</span>
            )}
          </div>
          <AddNewMenu />
        </div>
        {section ? <SectionTabs tabs={section.tabs} active={section.active} appId={appId} /> : null}
      </header>
      {title ? <PageTitle title={title} description={description ?? PAGE_COPY[tab ?? title] ?? PAGE_COPY[title]} badge={badge} actions={actions} /> : null}
    </>
  );
}
