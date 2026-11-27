import { Button } from "@foundry/ui/button";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DevTabs } from "./dev-tabs";
import { LifecycleRail, RailSteps, STAGES } from "./lifecycle-rail";
import { HeroScene, Scene } from "./scene";
import "./landing.css";
import { Docs, SiteHeader, Wrap, big } from "../site-header";
import { DOCS_BASE } from "../../shared/site";

const SignIn = ({ hero }: { hero?: boolean }) => (
  <Button size={hero ? "lg" : "default"} className={`ld-signin ${big(hero)}`} render={<Link to="/sign-in" search={{ redirect: undefined }} />}>
    Sign in
  </Button>
);

function Chapter({ id, stage, line, children }: { id: string; stage: string; line: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-12 border-b">
      <Wrap className="py-16 sm:py-24">
        <h2 id={`${id}-h`} className="font-semibold tracking-tighter">
          <span className="block text-display-xl leading-none text-muted-foreground">{stage}</span>
          <span className="mt-3 block max-w-3xl text-balance text-display-s leading-tight">{line}</span>
        </h2>
        {children}
      </Wrap>
    </section>
  );
}

const Facts = ({ items }: { items: readonly string[] }) => (
  <ul className="grid gap-2 border-t pt-5 text-sm">
    {items.map((f) => (
      <li key={f} className="flex gap-3">
        <span aria-hidden="true" className="mt-2 h-px w-3 shrink-0 bg-foreground" />
        {f}
      </li>
    ))}
  </ul>
);

const ATTEMPTS = ["First", "Retry 1", "Retry 2", "Retry 3", "Retry 4"] as const;

const NUMBERS = [
  { stage: "Queued", n: "202", line: "The status Relay answers a send with" },
  { stage: "Sent", n: "5", line: "Attempts a send makes in total, at most" },
  { stage: "Delivery", n: "6", line: "Attempts for each webhook delivery, at most" },
  { stage: "Queued", n: "3 files", line: "Up to 3 files, 5 MB each" },
] as const;

const DETAILS = [
  { title: "Signed webhooks", line: "Every webhook call carries an x-relay-signature header: an HMAC-SHA256 of the raw body." },
  { title: "Suppression built in", line: "Unsubscribes, hard bounces and complaints are suppressed, so a later send to that address is skipped." },
  { title: "Plain errors", line: "An HTTP status and one message string. No error codes to look up." },
  { title: "Worker binding", line: "A Cloudflare Worker can call Relay directly, without an HTTP request." },
] as const;

export function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <SiteHeader>
        <SignIn />
      </SiteHeader>
      <div className="mx-auto max-w-6xl border-x">
        <main id="main">
          <section aria-labelledby="hero" className="ld-frame border-b">
            <Wrap className="pb-10 pt-12 sm:pb-14 sm:pt-14 lg:pt-16">
              <h1 id="hero" className="max-w-5xl text-balance text-display-xl font-semibold leading-[0.98] tracking-tighter">
                Send email with one request. See what happens next.
              </h1>
              <div className="mt-6 sm:mt-8">
                <div>
                  <p className="max-w-xl text-pretty text-lede text-muted-foreground">
                    Relay gives your apps one API for transactional email, campaigns and inbound mail, with a console your whole team can read.
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground">Access is by invite. Ask your workspace owner.</p>
                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <Docs hero />
                    <SignIn hero />
                  </div>
                </div>
              </div>
              <div className="mt-8 sm:mt-10">
                <HeroScene label="A curl request returns 202 and the message appears in the Relay console as Queued, then Sent, with a timeline of Queued, Sent and Delivery." />
              </div>
            </Wrap>
          </section>

          <div className="relative">
            <LifecycleRail />

            <Chapter id="queued" stage="Queued." line="One request in, one message id back.">
              <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-14">
                <div className="lg:col-span-4">
                  <p className="text-pretty text-lede text-muted-foreground">
                    POST a message with a bearer key. Relay answers 202 and queues it. Retry with an idempotency key and you get the same message back, not a second email.
                  </p>
                  <div className="mt-6">
                    <Facts items={["A key belongs to one app, so the request carries no app id.", "Call the HTTP API from anywhere, or bind Relay to a Worker."]} />
                  </div>
                </div>
                <div className="min-w-0 lg:col-span-8">
                  <DevTabs />
                </div>
              </div>
            </Chapter>

            <Chapter id="sent" stage="Sent." line="Out the door, and on the record.">
              <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-14">
                <p className="text-pretty text-lede text-muted-foreground lg:col-span-5">
                  Relay sends from your verified domain and writes down every attempt. Campaigns go the same way: write once, send to a list, read the report.
                </p>
                <div className="lg:col-span-7 lg:col-start-6">
                  <Facts items={["Three streams: transactional, tracked and marketing.", "Marketing mail carries an unsubscribe link, and Relay stops sending to anyone who opts out.", "Each message page shows its timeline of events."]} />
                </div>
              </div>
              <figure className="m-0 mt-12 sm:mt-16">
                <ol className="ld-attempts m-0 grid list-none grid-cols-5 p-0">
                  {ATTEMPTS.map((label, i) => (
                    <li key={i} className="ld-attempt">
                      <span className="ld-attempt-dot font-mono text-xs">{i + 1}</span>
                      <span className="mt-3 block font-mono text-xs text-muted-foreground">{label}</span>
                    </li>
                  ))}
                </ol>
                <figcaption className="mt-8 max-w-xl text-sm text-muted-foreground">
                  A send stops at its first success. A failed attempt is retried, up to 5 attempts in total. A webhook delivery makes up to 6, doubling the wait from 1 minute.
                </figcaption>
              </figure>
            </Chapter>

            <Chapter id="delivery" stage="Delivery." line="Delivered, and what comes back.">
              <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:gap-14">
                <div className="lg:col-span-4">
                  <p className="text-pretty text-lede text-muted-foreground">
                    Delivery is also the way back. Give an app an inbox address on your domain: each letter that arrives is stored, then posted to your webhook as JSON with a signature you can verify. That post is its own record, with its own retries.
                  </p>
                  <div className="mt-6">
                    <Facts items={["One event today: mailbox.received.", "Up to 6 attempts, doubling from 1 minute, then retry from the console.", "Webhook URLs must be public https."]} />
                  </div>
                </div>
                <div className="grid min-w-0 gap-4 lg:col-span-8">
                  <Scene name="webhooks" label="A webhook's deliveries in the Relay console: a delivery fails with HTTP 503, is retried a minute later, and ends as Sent with two attempts and a 200 response." />
                  <figure className="ld-reveal m-0 overflow-hidden rounded-md border bg-card text-card-foreground">
                    <div className="border-b bg-muted px-3 py-2 sm:px-4">
                      <span className="ld-code font-mono">
                        <span className="text-muted-foreground">POST</span> https://hooks.northwind.test/relay
                      </span>
                    </div>
                    <pre tabIndex={0} className="ld-code m-0 overflow-x-auto p-3 sm:p-4" aria-label="Webhook delivery">
                      <code>
                        <span className="ld-k">x-relay-event:</span> mailbox.received{"\n"}
                        <span className="ld-k">x-relay-signature:</span> sha256=9f2c…{"\n"}
                        {"\n"}
                        {"{"}
                        {"\n  "}
                        <span className="ld-k">"id":</span> "whd_…",{"\n  "}
                        <span className="ld-k">"type":</span> "mailbox.received",{"\n  "}
                        <span className="ld-k">"createdAt":</span> 1767225600000,{"\n  "}
                        <span className="ld-k">"data":</span> {"{"}
                        {"\n    "}
                        <span className="ld-k">"from":</span> "ada@northwind.test",{"\n    "}
                        <span className="ld-k">"to":</span> "support@mail.northwind.test",{"\n    "}
                        <span className="ld-k">"subject":</span> "Re: Welcome aboard",{"\n    "}
                        <span className="ld-p">…</span>
                        {"\n  }\n}"}
                      </code>
                    </pre>
                  </figure>
                </div>
              </div>
            </Chapter>
          </div>

          <section aria-labelledby="numbers" className="border-b">
            <Wrap className="py-16 sm:py-24">
              <h2 id="numbers" className="max-w-3xl text-balance text-display-s font-semibold leading-tight tracking-tighter">
                The details, stated plainly.
              </h2>
              <dl className="mt-10 grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 lg:grid-cols-4">
                {NUMBERS.map((d) => (
                  <div key={d.n} className="bg-background p-5 sm:p-6">
                    <dt className="text-display-m font-semibold leading-none tracking-tighter">
                      <span className="block font-mono text-xs font-normal tracking-normal text-muted-foreground">{d.stage}</span>
                      <span className="mt-3 block">{d.n}</span>
                    </dt>
                    <dd className="mt-3 text-sm text-muted-foreground">{d.line}</dd>
                  </div>
                ))}
              </dl>
              <ul className="mt-12 grid gap-x-14 sm:grid-cols-2">
                {DETAILS.map((d) => (
                  <li key={d.title} className="border-t py-5">
                    <h3 className="text-sm font-semibold">{d.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{d.line}</p>
                  </li>
                ))}
              </ul>
            </Wrap>
          </section>

          <section aria-labelledby="start" className="border-b">
            <Wrap className="grid gap-12 py-20 sm:py-32 lg:grid-cols-12 lg:items-end lg:gap-14">
              <div className="lg:col-span-7">
                <h2 id="start" className="max-w-4xl text-balance text-display-l font-semibold leading-none tracking-tighter">
                  Sign in and send your first message.
                </h2>
                <p className="mt-6 max-w-xl text-lede text-muted-foreground">Create an app, copy its key, and run the curl above.</p>
                <div className="mt-8 flex flex-wrap gap-2">
                  <Docs href={`${DOCS_BASE}/quickstart/`} hero />
                  <SignIn hero />
                </div>
              </div>
              <div className="lg:col-span-5">
                <RailSteps ticked={STAGES.length} label="Message lifecycle, complete" />
              </div>
            </Wrap>
          </section>
        </main>
        <footer>
          <Wrap className="flex flex-col gap-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>Relay by a6n. © {new Date().getFullYear()}</span>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1">
              <a href={`${DOCS_BASE}/`} className="ld-link inline-flex min-h-6 items-center hover:text-foreground">
                Docs
              </a>
              <Link to="/sign-in" search={{ redirect: undefined }} className="ld-link inline-flex min-h-6 items-center hover:text-foreground">
                Sign in
              </Link>
              <a href="mailto:support@a6n.ai" className="ld-link inline-flex min-h-6 items-center hover:text-foreground">
                support@a6n.ai
              </a>
              <a href="mailto:sales@a6n.ai" className="ld-link inline-flex min-h-6 items-center hover:text-foreground">
                sales@a6n.ai
              </a>
            </nav>
          </Wrap>
        </footer>
      </div>
    </div>
  );
}
