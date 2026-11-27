import { SidebarTrigger } from "@foundry/ui/sidebar";
import { Link, useLocation, useRouteContext } from "@tanstack/react-router";
import ChevronLeft from "lucide-react/icons/chevron-left";
import { type ReactNode, useEffect } from "react";
import { PageTitle } from "../page/page-title";
import { AddNewMenu } from "./add-new";
import { sectionTabs } from "./nav";
import { trimSlash } from "../../lib/path";
import { usePageOf } from "./page-data";
import { isAppScoped } from "./scope";
import { ScopeSwitcher } from "./scope-switcher";
import { SectionTabs } from "./section-tabs";

export type Crumb = { label: string; to?: string; params?: Record<string, string>; search?: Record<string, unknown> };

// Static pages pass no crumbs: the route's `staticData.title` is the crumb and `copy` the description. Detail pages pass crumbs with the record's name.
export function PageHeader({ crumbs, badge, actions, description }: { crumbs?: Crumb[]; badge?: ReactNode; actions?: ReactNode; description?: string }) {
  const { pathname, search } = useLocation();
  const { shell } = useRouteContext({ from: "/_app" });
  const pageOf = usePageOf();
  // Looked up by path so a skeleton shown while the page loads reads the same declaration; dynamic routes pass their own description.
  const page = pageOf(trimSlash(pathname));
  const appId = (search as { appId?: string }).appId;
  const trail = crumbs ?? [{ label: page?.title ?? "" }];
  const last = trail.length - 1;
  const section = sectionTabs(shell.active?.roles ?? [], pathname, search as Record<string, unknown>, pageOf);
  const tab = section?.tabs.find((t) => t.id === section.active)?.label;
  const label = (section?.title ? tab : undefined) ?? trail[last]?.label;
  const title = section?.title ?? label;
  const parent = section?.title ? undefined : trail[last - 1];

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
            ) : isAppScoped(pathname, pageOf) ? (
              <ScopeSwitcher />
            ) : (
              <span className="truncate px-2 text-base font-medium">{shell.active?.name}</span>
            )}
          </div>
          <AddNewMenu />
        </div>
        {section ? <SectionTabs tabs={section.tabs} active={section.active} appId={appId} label={`${title ?? "Page"} sections`} /> : null}
      </header>
      {title ? <PageTitle title={title} description={description ?? page?.copy} badge={badge} actions={actions} /> : null}
    </>
  );
}
