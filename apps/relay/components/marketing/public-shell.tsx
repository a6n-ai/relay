import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="dark bg-background text-foreground min-h-dvh">
      <div className="dashboard-canvas min-h-dvh">
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
            <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold tracking-tight underline-offset-4 hover:underline md:min-h-0">
              Relay
            </Link>
            <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
              <Link href="/docs" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline md:min-h-0">
                Docs
              </Link>
              <Link href="/docs/api" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline md:min-h-0">
                Scalar
              </Link>
              <Link href="/docs/api/swagger" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline md:min-h-0">
                Swagger
              </Link>
            </nav>
            <Button asChild size="sm">
              <Link href="/login">
                Sign in
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </header>
        {children}
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
            <p>Relay</p>
            <div className="flex gap-6">
              <Link href="/v1/openapi.json" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline md:min-h-0">
                openapi.json
              </Link>
              <Link href="/login" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline md:min-h-0">
                Sign in
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
