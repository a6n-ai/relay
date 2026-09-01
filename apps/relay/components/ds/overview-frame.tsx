import type { ReactNode } from "react";
import { cn } from "@foundry/ui/cn";

type SlotSpan = 3 | 4 | 5 | 7 | 8 | 12;

function spanClass(span: SlotSpan): string {
  switch (span) {
    case 3:
      return "col-span-12 sm:col-span-6 lg:col-span-3";
    case 4:
      return "col-span-12 lg:col-span-4";
    case 5:
      return "col-span-12 lg:col-span-5";
    case 7:
      return "col-span-12 lg:col-span-7";
    case 8:
      return "col-span-12 lg:col-span-8";
    case 12:
      return "col-span-12";
    default: {
      const _exhaustive: never = span;
      return _exhaustive;
    }
  }
}

/** 12-column operator canvas. Density matches dashboard-shell-03; primitives are Foundry. */
export function OverviewFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("dashboard-shell mx-auto w-full max-w-7xl", className)}>
      <div className="dashboard-shell-grid">{children}</div>
    </div>
  );
}

export function OverviewSlot({
  children,
  span = 12,
  className,
}: {
  children: ReactNode;
  span?: SlotSpan;
  className?: string;
}) {
  return <div className={cn(spanClass(span), "min-w-0 bg-background", className)}>{children}</div>;
}
