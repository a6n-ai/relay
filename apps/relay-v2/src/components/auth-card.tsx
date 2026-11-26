import type { ReactNode } from "react";
import { Title } from "./page/text";
import { RelayMark } from "./relay-mark";

export function AuthCard({ title, children, footer }: { title?: string; children?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 items-center px-6">
        <RelayMark />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <div className="flex w-full max-w-sm flex-col gap-4 text-foreground">
          {title ? <Title>{title}</Title> : null}
          {children}
        </div>
        {footer ? <p className="text-sm text-muted-foreground">{footer}</p> : null}
      </main>
    </div>
  );
}
