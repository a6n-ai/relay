import { SidebarTrigger } from "@foundry/ui/sidebar";
import type { ReactNode } from "react";

// The nav is a sheet below md, so the trigger is the only way to open it on a phone.
export function ViewHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex h-11 items-center justify-between gap-2 border-b px-4">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <h1 className="truncate text-sm font-medium">{title}</h1>
      </div>
      {actions}
    </header>
  );
}
