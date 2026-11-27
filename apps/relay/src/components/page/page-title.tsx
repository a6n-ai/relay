import type { ReactNode } from "react";

export function PageTitle({ title, description, badge, actions }: { title: string; description?: string; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-4 pt-8 pb-6">
      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-3xl font-semibold tracking-tight">{title}</h1>
          {badge}
        </div>
        {description ? <p className="text-base text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
