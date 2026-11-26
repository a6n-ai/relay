import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@foundry/ui/breadcrumb";
import { SidebarTrigger } from "@foundry/ui/sidebar";
import { Link, useLocation } from "@tanstack/react-router";
import { Fragment, useEffect, type ReactNode } from "react";
import { isAppScoped } from "./scope";
import { ScopeSwitcher } from "./scope-switcher";

export type Crumb = { label: string; to?: string; params?: Record<string, string>; search?: Record<string, unknown> };

export function PageHeader({ crumbs, badge, actions }: { crumbs: Crumb[]; badge?: ReactNode; actions?: ReactNode }) {
  const pathname = useLocation({ select: (l) => l.pathname });
  const last = crumbs.length - 1;
  const title = crumbs[last]?.label;

  useEffect(() => {
    if (title) document.title = `${title} · Relay`;
  }, [title]);

  return (
    <header className="flex h-12 items-center justify-between gap-2 border-b px-4">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger size="icon" className="md:hidden" />
        {isAppScoped(pathname) ? <ScopeSwitcher /> : null}
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            {crumbs.map((crumb, i) => (
              <Fragment key={`${i}-${crumb.label}`}>
                {i > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem className="min-w-0">
                  {i === last || !crumb.to ? (
                    <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      render={<Link to={crumb.to as string} params={crumb.params as never} search={crumb.search as never} />}
                    >
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        {badge}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
      </div>
    </header>
  );
}
