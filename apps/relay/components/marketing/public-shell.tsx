import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="dark style-lyra bg-background text-foreground min-h-dvh">
      <div className="dashboard-canvas min-h-dvh">
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Relay
            </Link>
            <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
              <Link href="/docs" className="hover:text-foreground">
                Docs
              </Link>
              <Link href="/docs/api" className="hover:text-foreground">
                Scalar
              </Link>
              <Link href="/docs/api/swagger" className="hover:text-foreground">
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
              <Link href="/v1/openapi.json" className="hover:text-foreground">
                openapi.json
              </Link>
              <Link href="/login" className="hover:text-foreground">
                Sign in
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
