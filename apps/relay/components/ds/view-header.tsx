import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Linear view header: one compact row (16px icon, 18px title, actions on the right) with the
 * description on one muted line under it. Same props as @foundry/design-system PageHeader.
 */
export function ViewHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-56 flex-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {title}
        </h1>
        {subtitle ? <p className="mt-1 max-w-prose text-sm text-muted-foreground text-pretty">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
