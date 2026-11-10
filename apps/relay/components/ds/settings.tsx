import type { ReactNode } from "react";
import { cn } from "@foundry/ui/cn";

/** Settings page: one centred 600px column, a title, then sections of rows. */
export function SettingsPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col gap-8 pt-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground text-pretty">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** A heading with a rounded card under it. Fill the card with SettingsRow (or a form of them). */
export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? <p className="text-[13px] text-muted-foreground text-pretty">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{children}</div>
    </section>
  );
}

/** Label and one muted line on the left, the control on the right. */
export function SettingsRow({
  label,
  description,
  children,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-settings-row
      className={cn("flex items-center justify-between gap-4 px-4 py-3 max-sm:flex-col max-sm:items-stretch", className)}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-sm font-medium">{label}</div>
        {description ? <div className="text-[13px] text-muted-foreground text-pretty">{description}</div> : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2 sm:max-w-[60%]">{children}</div> : null}
    </div>
  );
}

/** Free-form content inside a settings card, when it is not label and control. */
export function SettingsBody({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3">{children}</div>;
}

/** Last row of a settings form: the save button on the right. */
export function SettingsFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-3">{children}</div>;
}
