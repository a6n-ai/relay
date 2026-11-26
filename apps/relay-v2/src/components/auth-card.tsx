import type { ReactNode } from "react";
import { Title } from "./page/text";

export function AuthCard({ title, children, footer }: { title?: string; children?: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background p-6">
      <p className="text-lg font-semibold tracking-tight">Relay</p>
      <div className="flex w-full max-w-sm flex-col gap-4 text-foreground">
        {title ? <Title>{title}</Title> : null}
        {children}
      </div>
      {footer ? <p className="text-sm text-muted-foreground">{footer}</p> : null}
    </main>
  );
}
