import { Button } from "@foundry/ui/button";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DevTabs } from "./dev-tabs";
import { HeroScene, Scene } from "./scene";
import "./landing.css";

const Wrap = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`mx-auto w-full max-w-6xl px-4 sm:px-8 ${className}`}>{children}</div>
);

const Docs = ({ href = "/docs/", children = "Docs" }: { href?: string; children?: ReactNode }) => (
  <Button variant="outline" render={<a href={href} />}>
    {children}
  </Button>
);

const SignIn = () => (
  <Button render={<Link to="/sign-in" search={{ redirect: undefined }} />}>Sign in</Button>
);

function Feature({ tag, title, body, facts, flip, children }: { tag: string; title: string; body: string; facts: readonly string[]; flip?: boolean; children?: ReactNode }) {
  return (
    <section aria-labelledby={`f-${tag}`} className="border-b">
      <Wrap className="grid gap-8 py-14 sm:py-20 lg:grid-cols-12 lg:items-start lg:gap-14">
        <div className={`${children ? "lg:sticky lg:top-24 lg:col-span-5" : "lg:col-span-8"} ${flip ? "lg:order-2" : ""}`}>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{tag}</p>
          <h2 id={`f-${tag}`} className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground">{body}</p>
          <ul className="mt-6 grid gap-2 border-t pt-5 text-sm">
            {facts.map((f) => (
              <li key={f} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-px w-3 shrink-0 bg-foreground" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        {children ? <div className={`grid gap-4 lg:col-span-7 ${flip ? "lg:order-1" : ""}`}>{children}</div> : null}
      </Wrap>
    </section>
  );
}

const DETAILS = [
  { title: "Idempotent sends", line: "Add an idempotencyKey. A retry returns the original message with duplicate set to true." },
  { title: "Signed webhooks", line: "Every webhook call carries an x-relay-signature header: an HMAC-SHA256 of the raw body." },
  { title: "Suppression built in", line: "Unsubscribes, hard bounces and complaints are suppressed, so a later send to that address is skipped." },
  { title: "Attachments", line: "Up to 3 files per message, 5 MB each, sent as base64." },
  { title: "Plain errors", line: "An HTTP status and one message string. No error codes to look up." },
  { title: "Worker binding", line: "A Cloudflare Worker can call Relay directly, without an HTTP request." },
] as const;

export function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <header className="border-b">
        <Wrap className="flex h-14 items-center justify-between">
          <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <span aria-hidden="true" className="size-4 rounded-full bg-foreground" />
            Relay
          </span>
          <nav aria-label="Primary" className="flex items-center gap-2">
            <Docs />
            <SignIn />
          </nav>
        </Wrap>
      </header>
      <div className="mx-auto max-w-6xl border-x">
        <main id="main">
          <section aria-labelledby="hero" className="ld-frame border-b">
            <Wrap className="grid gap-10 py-12 sm:py-16 lg:grid-cols-12 lg:items-center lg:gap-12 lg:py-24">
              <div className="lg:col-span-5">
                <h1 id="hero" className="text-balance text-4xl font-semibold tracking-tighter sm:text-5xl">
                  Send email with one request. See what happens next.
                </h1>
                <p className="mt-5 text-pretty text-lg text-muted-foreground">
                  Relay gives your apps one API for transactional email, campaigns and inbound mail, with a console your whole team can read.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-2">
                  <Docs />
                  <SignIn />
                </div>
                <p className="mt-4 text-sm text-muted-foreground">Access is by invite. Ask your workspace owner.</p>
              </div>
              <div className="min-w-0 lg:col-span-7">
                <HeroScene label="The Relay console: a curl request returns 202, the message appears in Messages as Queued, then Sent, and its timeline shows Queued, Sent and Delivery." />
              </div>
            </Wrap>
          </section>

          <Feature
            tag="Send"
            title="Transactional mail that leaves a trail."
            body="POST a message with a bearer key. Relay answers 202 with a message id, then records each step: queued, sent, then each delivery event. Retry with an idempotency key and you get the same message back, not a second email."
            facts={["Three streams: transactional, tracked and marketing.", "Each message page shows its timeline of events.", "Suppressed recipients are recorded as suppressed and never sent."]}
          />

          <Feature
            flip
            tag="Campaigns"
            title="Write once. Send to a list. Read the report."
            body="Build a template, add people to a list and send now or schedule it. Each campaign keeps its own stats. Marketing mail carries an unsubscribe link, and Relay stops sending to anyone who opts out."
            facts={["Each list records where its members' consent came from.", "Automations send a template when someone joins a list.", "Templates with merge fields for names and your own data.", "Draft, scheduled and sent campaigns in one table."]}
          >
            <Scene name="campaigns" label="A campaign page in the Relay console: Schedule opens a dialog, Send now starts the campaign, and the page shows its recipients and sent counts rising." />
            <Scene name="lists" label="The Import contacts dialog on a list: a CSV file is dropped in, the import reports Added 3 and Suppressed 1, and the new contacts appear on the list." />
          </Feature>

          <Feature
            tag="Inbound"
            title="Replies reach your app."
            body="Give an app an inbox address on your domain. Each letter that arrives is stored, then posted to your webhook as JSON with a signature you can verify."
            facts={["One event today: mailbox.received.", "Up to 6 attempts with backoff, then retry from the console.", "Webhook URLs must be public https."]}
          >
            <Scene name="inbound" label="Messages, Received, in the Relay console: a letter from ada@example.com arrives at the top of the list and is posted to the webhook as mailbox.received." />
            <figure className="ld-reveal m-0 overflow-hidden rounded-md border bg-card text-card-foreground">
              <div className="border-b bg-muted px-3 py-2 sm:px-4">
                <span className="ld-code font-mono">
                  <span className="text-muted-foreground">POST</span> https://hooks.example.com/relay
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
                  <span className="ld-k">"from":</span> "ada@example.com",{"\n    "}
                  <span className="ld-k">"to":</span> "support@mail.acme.test",{"\n    "}
                  <span className="ld-k">"subject":</span> "Re: Welcome aboard",{"\n    "}
                  <span className="ld-p">…</span>
                  {"\n  }\n}"}
                </code>
              </pre>
            </figure>
            <Scene name="webhooks" label="A webhook's deliveries in the Relay console: a delivery fails with HTTP 503, is retried a minute later, and ends as Sent with two attempts and a 200 response." />
          </Feature>

          <Feature
            flip
            tag="Console"
            title="Your team sees what your code sent."
            body="Verify a domain, add sender addresses, invite teammates and choose what each can do. Failed messages and suppressions each have their own page."
            facts={["Domains show their verification status.", "Addresses are sender, inbox or both.", "Roles for each teammate, per workspace."]}
          />

          <section aria-labelledby="dev" className="border-b">
            <Wrap className="grid gap-8 py-14 sm:py-20 lg:grid-cols-12 lg:gap-14">
              <div className="lg:col-span-4">
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Developers</p>
                <h2 id="dev" className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                  The same request in your language.
                </h2>
                <p className="mt-4 text-base text-muted-foreground">
                  A key belongs to one app, so the request carries no app id. Call the HTTP API from anywhere, or bind Relay to a Worker.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Docs href="/docs/quickstart/">Read the quickstart</Docs>
                </div>
              </div>
              <div className="min-w-0 lg:col-span-8">
                <DevTabs />
              </div>
            </Wrap>
          </section>

          <section aria-labelledby="details" className="border-b">
            <Wrap className="py-14 sm:py-20">
              <h2 id="details" className="max-w-xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                The details that cost you a week.
              </h2>
              <ul className="mt-10 grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 lg:grid-cols-3">
                {DETAILS.map((d) => (
                  <li key={d.title} className="bg-background p-5">
                    <h3 className="text-sm font-semibold">{d.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{d.line}</p>
                  </li>
                ))}
              </ul>
            </Wrap>
          </section>

          <section aria-labelledby="start" className="border-b">
            <Wrap className="flex flex-col items-start gap-6 py-14 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 id="start" className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                  Sign in and send your first message.
                </h2>
                <p className="mt-2 text-muted-foreground">Create an app, copy its key, and run the curl above.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Docs href="/docs/quickstart/">Read the quickstart</Docs>
                <SignIn />
              </div>
            </Wrap>
          </section>
        </main>
        <footer>
          <Wrap className="flex flex-col gap-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>Relay by a6n. © {new Date().getFullYear()}</span>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
              <a href="/docs/" className="hover:text-foreground">
                Docs
              </a>
              <Link to="/sign-in" search={{ redirect: undefined }} className="hover:text-foreground">
                Sign in
              </Link>
              <a href="mailto:support@a6n.ai" className="hover:text-foreground">
                support@a6n.ai
              </a>
              <a href="mailto:sales@a6n.ai" className="hover:text-foreground">
                sales@a6n.ai
              </a>
            </nav>
          </Wrap>
        </footer>
      </div>
    </div>
  );
}
