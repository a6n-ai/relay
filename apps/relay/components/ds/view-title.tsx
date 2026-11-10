"use client";

import Link from "next/link";
import { Fragment } from "react";
import { ChevronRightIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { viewCrumbs } from "./view-crumbs";

/** The breadcrumb half of the panel title row. The last crumb is the page's one h1. */
export function ViewTitle({ title }: { title: string }) {
  const crumbs = viewCrumbs(usePathname(), title);
  const last = crumbs.length - 1;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
      {crumbs.map((c, i) => (
        <Fragment key={`${c.label}-${i}`}>
          {i > 0 ? <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground max-sm:hidden" /> : null}
          {i === last ? (
            <h1 className="truncate text-[13px] font-medium tracking-normal">{c.label}</h1>
          ) : (
            <Link
              href={c.href ?? "#"}
              prefetch={false}
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground max-sm:hidden"
            >
              {c.label}
            </Link>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
