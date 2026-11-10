import type { ReactNode } from "react";
import Link from "next/link";
import { PillLink } from "./pill-link";

const link =
  "inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground md:min-h-0";

const FOOTER = [
  { title: "Product", links: [{ href: "/docs", label: "Docs" }, { href: "/docs/api", label: "API" }] },
  { title: "Developers", links: [{ href: "/docs/api/swagger", label: "Swagger" }, { href: "/v1/openapi.json", label: "openapi.json" }] },
  { title: "Account", links: [{ href: "/login", label: "Sign in" }, { href: "/forgot-password", label: "Forgot password" }] },
] as const;

export function Wordmark() {
  return (
    <Link href="/" className="inline-flex min-h-11 items-center text-base font-semibold tracking-tight focus-visible:underline md:min-h-0">
      Relay
    </Link>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <a
        href="#content"
        className="bg-primary text-primary-foreground sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-20 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
          <Wordmark />
          <nav className="flex items-center gap-5 md:gap-6" aria-label="Main">
            <Link href="/docs" className={link}>
              Docs
            </Link>
            <Link href="/docs/api" className={link}>
              API
            </Link>
            <span className="h-4 w-px bg-border" aria-hidden />
            <PillLink href="/login" size="sm">
              Sign in
            </PillLink>
          </nav>
        </div>
      </header>
      <div id="content">{children}</div>
      <footer className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1.5fr_repeat(3,1fr)] md:px-8">
          <div className="flex flex-col gap-3">
            <Wordmark />
            <p className="max-w-56 text-sm text-muted-foreground">Every message, from one place.</p>
          </div>
          {FOOTER.map((col) => (
            <div key={col.title} className="flex flex-col gap-1 md:gap-3">
              <p className="text-sm font-medium">{col.title}</p>
              {col.links.map((l) => (
                <Link key={l.href} href={l.href} className={link}>
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
