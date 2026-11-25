import type { ReactNode } from "react";
import { Title } from "./page/text";

export function AuthCard({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6">
      <p className="text-lg font-semibold tracking-tight">Relay</p>
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-card p-6 text-card-foreground">
        {title ? <Title>{title}</Title> : null}
        {children}
      </div>
    </main>
  );
}
