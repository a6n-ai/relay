import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";

/**
 * Linear empty state: an outlined glyph, a bold title, two or three muted lines, a lavender pill
 * call to action (a link, or any node such as a pill CreateDialog) and an optional ghost Docs link.
 */
export function EmptyState({
  icon: Icon,
  title,
  lines,
  cta,
  action,
  docsHref,
  className,
}: {
  icon: LucideIcon;
  title: string;
  lines: readonly string[];
  cta?: { label: string; href: string };
  action?: ReactNode;
  docsHref?: string;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex max-w-sm flex-col items-center gap-3 px-5 py-16 text-center", className)}>
      <Icon aria-hidden strokeWidth={1.25} className="size-10 text-muted-foreground" />
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <div className="flex flex-col gap-0.5 text-sm text-muted-foreground text-pretty">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {cta || action || docsHref ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {cta ? (
            <Button asChild className="rounded-full">
              <Link href={cta.href} prefetch={false}>
                {cta.label}
              </Link>
            </Button>
          ) : null}
          {action}
          {docsHref ? (
            <Button asChild variant="ghost" className="rounded-full">
              <Link href={docsHref} prefetch={false}>
                Docs
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
