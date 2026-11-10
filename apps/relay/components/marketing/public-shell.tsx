import type { ReactNode } from "react";
import Link from "next/link";
import { PillLink } from "./pill-link";

const link =
  "inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground md:min-h-0";

/** Plain link columns. Only routes that exist (no Privacy/Terms until those pages ship). */
const FOOTER = [
  {
    title: "Product",
    links: [
      { href: "/#send", label: "One send" },
      { href: "/#inbox", label: "Inbox" },
      { href: "/#campaigns", label: "Campaigns" },
      { href: "/docs", label: "Docs" },
    ],
  },
  {
    title: "Channels",
    links: [
      { href: "/docs", label: "Email" },
      { href: "/docs", label: "Text" },
      { href: "/docs", label: "WhatsApp" },
      { href: "/docs", label: "In the app" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs/api", label: "API" },
      { href: "/docs/api/swagger", label: "Swagger" },
      { href: "/v1/openapi.json", label: "openapi.json" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/forgot-password", label: "Forgot password" },
    ],
  },
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
            <PillLink href="/login">
              Sign in
            </PillLink>
          </nav>
        </div>
      </header>
      <div id="content">{children}</div>
      <footer className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 pt-14 pb-10 sm:grid-cols-2 md:grid-cols-[1.4fr_repeat(4,1fr)] md:px-8">
          <div className="flex flex-col gap-3 sm:col-span-2 md:col-span-1">
            <Wordmark />
            <p className="max-w-56 text-sm leading-6 text-muted-foreground">
              Every message, from one place. Email, text, WhatsApp and in the app.
            </p>
          </div>
          {FOOTER.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <p className="text-sm font-medium text-foreground">{col.title}</p>
              <ul className="flex flex-col gap-1">
                {col.links.map((l) => (
                  <li key={`${col.title}-${l.label}`}>
                    <Link href={l.href} className={link}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-8">
            <p>© {new Date().getFullYear()} Relay</p>
            <p>Built for operators who send for real.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
