import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { DispatchBurst } from "./dispatch-burst";

const CHANNELS = [
  {
    name: "Email",
    body: "Transactional mail through sending domains and SMTP. Receipts, password resets, and lifecycle copy in one hop.",
  },
  {
    name: "SMS",
    body: "Short, time-critical alerts. Each row retries on its own clock so a slow carrier never blocks email.",
  },
  {
    name: "WhatsApp",
    body: "Conversation-shaped delivery for the same event. Same payload, different channel row in the outbox.",
  },
  {
    name: "In-app",
    body: "Feed and bell for people already inside the product. No extra vendor round-trip for the in-product copy.",
  },
] as const;

export function Landing() {
  return (
    <div className="dark style-lyra bg-background text-foreground min-h-dvh">
      <a
        href="#content"
        className="bg-primary text-primary-foreground sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-20 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="dashboard-canvas min-h-dvh">
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Relay
            </Link>
            <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
              <a href="#how" className="hover:text-foreground">
                How it works
              </a>
              <a href="#channels" className="hover:text-foreground">
                Channels
              </a>
              <Link href="/docs" className="hover:text-foreground">
                Docs
              </Link>
              <Link href="/docs/api" className="hover:text-foreground">
                API
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

        <main id="content">
          <section className="mx-auto grid min-h-[calc(100dvh-3.75rem)] max-w-6xl grid-cols-1 border-b border-border lg:grid-cols-2">
            <div className="flex flex-col justify-center gap-8 px-5 py-16 md:px-8 md:py-24">
              <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
                Notifications that leave through one door.
              </h1>
              <p className="max-w-[38rem] text-base leading-7 text-pretty text-muted-foreground md:text-lg">
                Relay is the notification product for email, SMS, WhatsApp, and in-app. Your app
                posts once. We write an outbox row per channel, retry failures, and give operators a
                console to watch delivery.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild>
                  <Link href="/login">
                    Sign in to Relay
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <a href="#how">How a send fans out</a>
                </Button>
              </div>
            </div>
            <div className="relative min-h-[52vh] overflow-hidden border-t border-border lg:min-h-full lg:border-t-0 lg:border-l">
              <DispatchBurst />
              <p className="pointer-events-none absolute right-4 bottom-4 font-mono text-[11px] text-muted-foreground">
                Click to dispatch
              </p>
            </div>
          </section>

          <section id="how" className="border-b border-border">
            <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-12">
              <div className="px-5 py-16 md:px-8 md:py-24 lg:col-span-4">
                <h2 className="text-3xl font-semibold tracking-tight text-balance">
                  Your event. Our outbox. Their inbox.
                </h2>
              </div>
              <ol className="grid grid-cols-1 gap-px bg-border lg:col-span-8 lg:grid-cols-3">
                <li className="bg-background px-5 py-10 md:px-8">
                  <p className="font-mono text-xs text-muted-foreground">POST /v1/messages</p>
                  <h3 className="mt-6 text-xl font-semibold tracking-tight">App fires an event</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Tenants authenticate with an API key. One payload names the event and the
                    recipient. Relay does not share the operator session with apps.
                  </p>
                </li>
                <li className="bg-background px-5 py-10 md:px-8">
                  <p className="font-mono text-xs text-muted-foreground">notification_outbox</p>
                  <h3 className="mt-6 text-xl font-semibold tracking-tight">Rows per channel</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Each hop is its own row: pending, processing, sent, or failed. Backoff runs from
                    one minute to one hour so a stuck SMS never queues email.
                  </p>
                </li>
                <li className="bg-background px-5 py-10 md:px-8">
                  <p className="font-mono text-xs text-muted-foreground">operator console</p>
                  <h3 className="mt-6 text-xl font-semibold tracking-tight">Someone can see it</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Operators sign in to manage tenants, sending domains, SMTP, templates, and the
                    live outbox — the same canvas the burst on this page is drawing.
                  </p>
                </li>
              </ol>
            </div>
          </section>

          <section id="channels" className="border-b border-border">
            <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
              <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                Four channels. Same event.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
                Pick the channel the person is actually on. Relay keeps the fan-out honest: one
                event, independent delivery.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
              {CHANNELS.map((ch) => (
                <article key={ch.name} className="bg-background px-5 py-12 md:px-8 md:py-16">
                  <h3 className="text-2xl font-semibold tracking-tight">{ch.name}</h3>
                  <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">{ch.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="api" className="border-b border-border">
            <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-12">
              <div className="px-5 py-16 md:px-8 md:py-24 lg:col-span-5">
                <h2 className="text-3xl font-semibold tracking-tight">One call from the product.</h2>
                <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
                  Send with an app key. Mailbox, campaigns, people lists, automations, apps, tags, and
                  team are in the same OpenAPI file — Scalar and Swagger on the docs site.
                </p>
                <Button asChild className="mt-8">
                  <Link href="/docs/api">
                    Open API docs
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
              </div>
              <pre className="overflow-x-auto bg-card px-5 py-16 font-mono text-xs leading-6 text-card-foreground md:px-8 lg:col-span-7">
{`curl -X POST "https://relay.example/v1/messages" \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event": "order.paid",
    "title": "Order paid",
    "body": "Thanks — we have your order.",
    "to": { "email": "ops@example.com" }
  }'`}
              </pre>
            </div>
          </section>

          <section className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-20 md:flex-row md:items-end md:justify-between md:px-8 md:py-28">
            <h2 className="max-w-lg text-3xl font-semibold tracking-tight text-balance md:text-4xl">
              Run Relay as an operator. Send through it as a tenant.
            </h2>
            <Button asChild size="lg">
              <Link href="/login">
                Sign in
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          </section>
        </main>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
            <p>Relay</p>
            <div className="flex gap-6">
              <Link href="/docs" className="hover:text-foreground">
                Docs
              </Link>
              <Link href="/login" className="hover:text-foreground">
                Sign in
              </Link>
              <a href="#how" className="hover:text-foreground">
                How it works
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
