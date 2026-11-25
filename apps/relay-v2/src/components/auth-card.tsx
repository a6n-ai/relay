import type { ReactNode } from "react";

export function AuthCard({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6">
      <p className="text-lg font-semibold tracking-tight">Relay</p>
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border bg-card p-6 text-card-foreground">
        {title ? <h1 className="text-lg font-medium">{title}</h1> : null}
        {children}
      </div>
    </main>
  );
}
