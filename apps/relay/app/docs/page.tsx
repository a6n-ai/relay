import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/marketing/public-shell";
import { PUBLIC_API_OPERATIONS } from "@/lib/v1/openapi";

export const metadata: Metadata = {
  title: "Relay docs",
  description: "HTTP APIs for send, mailbox, campaigns, people lists, automations, apps, tags, and team.",
};

const GROUPS = [
  { href: "/docs/api", title: "Scalar", body: "Try every operation against the live OpenAPI document." },
  { href: "/docs/api/swagger", title: "Swagger UI", body: "Same spec in Swagger. Use a console session for operator routes." },
  { href: "/v1/openapi.json", title: "openapi.json", body: "Machine-readable source for later SDKs in other languages." },
] as const;

export default function DocsPage() {
  const tags = [...new Set(PUBLIC_API_OPERATIONS.map((o) => o.path.split("/").filter(Boolean)[2] ?? o.path))];

  return (
    <PublicShell>
      <main className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <h1 className="text-4xl font-semibold tracking-tight">Docs</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          Apps send with a Bearer key. Mailbox, campaigns, people lists, automations, apps, tags, and
          team use the operator session — no need to click through the console once you have a cookie
          or a key.
        </p>
        <div className="mt-12 grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
          {GROUPS.map((g) => (
            <Link key={g.href} href={g.href} className="bg-background px-5 py-10 hover:bg-muted/40 md:px-8">
              <h2 className="text-xl font-semibold tracking-tight">{g.title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{g.body}</p>
            </Link>
          ))}
        </div>
        <h2 className="mt-16 text-2xl font-semibold tracking-tight">Operations</h2>
        <ul className="mt-6 divide-y divide-border border border-border">
          {PUBLIC_API_OPERATIONS.map((o) => (
            <li key={`${o.method}:${o.path}`} className="flex flex-wrap items-baseline gap-3 px-4 py-3 text-sm">
              <span className="font-mono text-xs text-primary">{o.method}</span>
              <span className="font-mono">{o.path}</span>
              <span className="text-muted-foreground">{o.summary}</span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-xs text-muted-foreground">
          Groups in the spec: {tags.filter(Boolean).slice(0, 12).join(", ")}.
        </p>
      </main>
    </PublicShell>
  );
}
