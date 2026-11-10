"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { EmptyState } from "./empty-state";
import { Panel } from "./panel";
import { StatusGlyph, type GlyphKind } from "./status-glyph";

/** A framed board sits in a settings card; the default is Linear's list: no card, rows run edge to edge. */
const FramedContext = createContext(false);

export function ResourceBoard({
  title,
  count,
  toolbar,
  framed = false,
  children,
}: {
  title: string;
  count?: string | number;
  toolbar?: ReactNode;
  framed?: boolean;
  children: ReactNode;
}) {
  const countLabel =
    count != null ? (
      <span className="nums shrink-0 text-sm text-muted-foreground tabular-nums">
        {typeof count === "number" ? count.toLocaleString("en") : count}
      </span>
    ) : null;
  return (
    <FramedContext.Provider value={framed}>
      <section className="flex flex-col gap-3">
        {framed ? (
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {countLabel}
          </div>
        ) : (
          <h2 className="sr-only">{title}</h2>
        )}
        {toolbar || (!framed && countLabel) ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">{toolbar}</div>
            {framed ? null : countLabel}
          </div>
        ) : null}
        {framed ? (
          <Panel className="divide-y divide-border">{children}</Panel>
        ) : (
          <div className="-mx-6 flex flex-col">{children}</div>
        )}
      </section>
    </FramedContext.Provider>
  );
}

/** Group header strip: "Status  N" on a slightly lighter fill. */
export function ResourceGroup({
  label,
  count,
  glyph,
  children,
}: {
  label: string;
  count: number;
  glyph?: GlyphKind;
  children: ReactNode;
}) {
  const framed = useContext(FramedContext);
  return (
    <div role="group" aria-label={label}>
      <div className={cn("flex h-9 items-center gap-2 bg-muted/50 text-[13px] font-medium", framed ? "px-4" : "px-6")}>
        {glyph ? <StatusGlyph kind={glyph} /> : null}
        {label}
        <span className="nums text-muted-foreground tabular-nums">{count.toLocaleString("en")}</span>
      </div>
      {children}
    </div>
  );
}

/** A 40px list row: status glyph, mono short id, title, a muted line, then trailing text and chips. */
export function ResourceRow({
  title,
  meta,
  trailing,
  trailingText,
  shortId,
  glyph,
  glyphLabel,
  href,
}: {
  title: string;
  meta?: string;
  trailing?: ReactNode;
  trailingText?: string;
  shortId?: string;
  glyph?: GlyphKind;
  glyphLabel?: string;
  href?: string;
}) {
  const framed = useContext(FramedContext);
  const className = cn(
    "flex h-10 items-center gap-3 text-sm outline-none [content-visibility:auto] [contain-intrinsic-size:auto_40px]",
    framed ? "px-4" : "px-6",
    href && "transition-colors duration-150 hover:bg-accent focus-visible:bg-accent active:bg-accent",
  );
  const body = (
    <>
      {glyph ? <StatusGlyph kind={glyph} label={glyphLabel} /> : null}
      {shortId ? (
        <span className="hidden w-14 shrink-0 truncate font-mono text-xs text-muted-foreground sm:block">{shortId}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
      {meta ? <span className="hidden max-w-[40%] shrink-0 truncate text-[13px] text-muted-foreground md:block">{meta}</span> : null}
      {trailingText ? (
        <span className="hidden max-w-[30%] shrink-0 truncate text-[13px] text-muted-foreground lg:block">{trailingText}</span>
      ) : null}
      {trailing ? <span className="flex shrink-0 items-center justify-end gap-2">{trailing}</span> : null}
    </>
  );
  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link href={href} prefetch={false} className={className}>
      {body}
    </Link>
  );
}

/** A quiet in-list message (nothing matches a search) or, with a title, a full empty state. */
export function ResourceEmpty({ icon, message, title }: { icon: LucideIcon; message: string; title?: string }) {
  return <EmptyState icon={icon} title={title ?? "Nothing here"} lines={[message]} className="py-12" />;
}
