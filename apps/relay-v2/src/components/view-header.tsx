import type { ReactNode } from "react";

export function ViewHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex h-11 items-center justify-between gap-2 border-b px-4">
      <h1 className="text-sm font-medium">{title}</h1>
      {actions}
    </header>
  );
}
