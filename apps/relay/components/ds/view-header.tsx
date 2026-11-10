import type { ReactNode } from "react";
import { SectionTabs } from "./section-tabs";
import { SECTION_LABELS, type SectionKey } from "./section-labels";
import { ViewTitle } from "./view-title";

/**
 * Linear panel header. Title row (44px, hairline below): breadcrumb on the left, actions ("+ New …")
 * on the right. View row (40px, hairline below, only when there is something for it): `section` tabs
 * or a `tabs` slot on the left, round icon buttons (`tools`) on the right. `subtitle` is one muted line under.
 */
export function ViewHeader({
  title,
  subtitle,
  actions,
  section,
  tabs,
  tools,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Shows that section's SectionTabs pills in the view row. */
  section?: SectionKey;
  /** Anything else for the left of the view row (used instead of `section`). */
  tabs?: ReactNode;
  tools?: ReactNode;
}) {
  const left = tabs ?? (section ? <SectionTabs section={section} label={SECTION_LABELS[section]} /> : null);
  return (
    <header className="-mt-6">
      <div className="view-rule flex h-11 items-center justify-between gap-3">
        <ViewTitle title={title} />
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {left || tools ? (
        <div className="view-rule flex min-h-10 items-center justify-between gap-3 py-1">
          <div className="min-w-0">{left}</div>
          {tools ? <div className="flex shrink-0 items-center gap-1.5">{tools}</div> : null}
        </div>
      ) : null}
      {subtitle ? <p className="mt-4 max-w-prose text-sm text-muted-foreground text-pretty">{subtitle}</p> : null}
    </header>
  );
}
