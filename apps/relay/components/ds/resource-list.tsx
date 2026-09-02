"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRightIcon } from "lucide-react";
import { EmptyState } from "@foundry/design-system";
import { cn } from "@foundry/ui/cn";

export function ResourceBoard({
  title,
  count,
  toolbar,
  children,
}: {
  title: string;
  count?: string | number;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">{title}</h2>
          {count != null ? (
            <span className="text-muted-foreground nums text-sm tabular-nums">{count}</span>
          ) : null}
        </div>
        {toolbar}
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

export function ResourceRow({
  title,
  meta,
  trailing,
  href,
}: {
  title: string;
  meta?: string;
  trailing?: ReactNode;
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3.5",
        href &&
          "transition-colors duration-150 hover:bg-muted/50 active:bg-muted",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        {meta ? <p className="text-muted-foreground truncate text-sm">{meta}</p> : null}
      </div>
      {trailing ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{trailing}</div> : null}
      {href ? <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" /> : null}
    </div>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block outline-none focus-visible:bg-muted/50">
      {body}
    </Link>
  );
}

export function ResourceEmpty({
  icon,
  message,
}: {
  icon: LucideIcon;
  message: string;
}) {
  return <EmptyState icon={icon} message={message} />;
}
