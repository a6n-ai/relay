import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { ChannelStrip } from "./channel-strip";
import { CodeSample } from "./code-sample";
import { ContactSection } from "./contact-section";
import { SendDemo } from "./demo/send-demo";
import { CampaignsSlice, DeliverySlice, InboxSlice, TeamSlice } from "./demo/slices";
import { FeatureSection } from "./feature-section";
import { HairlineFigure } from "./hairline-figure";
import { LandingScroll } from "./landing-scroll";
import { PillLink } from "./pill-link";
import { PublicShell } from "./public-shell";

const POINTS = [
  {
    figure: "sorter" as const,
    title: "One send, email and in the app",
    body: "Post a message once. Relay sends it by email and in your app today, with text and WhatsApp next.",
  },
  {
    figure: "nameplates" as const,
    title: "Your apps, your domains",
    body: "Connect each app and send from addresses on your own domain.",
  },
  {
    figure: "gauge" as const,
    title: "Delivery you can see",
    body: "Follow every message from queued to delivered, and retry the ones that fail.",
  },
] as const;

const SAFE = [
  {
    title: "Your domain",
    body: "Mail leaves from your own verified domain, signed with DKIM.",
  },
  {
    title: "Safe incoming mail",
    body: "Remote images and scripts in incoming mail are blocked before anyone opens it.",
  },
  {
    title: "Every client kept apart",
    body: "Each client is a workspace of its own, with its own apps, messages and limits.",
  },
  {
    title: "Unsubscribe handled",
    body: "Campaign emails carry a one-click unsubscribe, and a suppression list keeps opted-out people off future sends.",
  },
] as const;

export function Landing() {
  return (
    <PublicShell>
      <LandingScroll>
        <main>
          <section
            data-reveal-hero
            className="mx-auto max-w-6xl px-5 pt-16 md:px-8 md:pt-20"
          >
            <h1 className="max-w-3xl text-5xl leading-[1.05] font-semibold tracking-[-0.022em] text-balance md:text-[64px]">
              Email, inbox and campaigns for every app you run.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-7 text-muted-foreground">
              Relay sends your apps&apos; email and in-app messages from your own domain, keeps every reply in one inbox, and shows you where each message landed.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <PillLink href="#contact">Talk to us</PillLink>
              <PillLink href="/docs" tone="ghost">
                Read the docs
              </PillLink>
            </div>
          </section>
          <div data-reveal-demo className="relative mt-12 overflow-hidden md:mt-16">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,color-mix(in_srgb,var(--foreground)_9%,transparent),transparent_75%)]"
              aria-hidden
            />
            <div className="relative mx-auto max-w-[1096px] px-3 md:px-8">
              <SendDemo />
            </div>
          </div>

          <section data-reveal className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-32">
            <p className="max-w-4xl text-2xl leading-snug font-semibold tracking-[-0.022em] text-balance md:text-4xl md:leading-[1.2]">
              Relay is where your apps send from.{" "}
              <span className="text-muted-foreground">
                Post a message once. Relay sends it by email and in your app today, with text and WhatsApp next.
              </span>
            </p>
          </section>

          <section id="send" className="scroll-mt-20 border-t border-border">
            <div
              data-reveal
              data-reveal-stagger
              className="mx-auto grid max-w-6xl md:grid-cols-3 md:divide-x md:divide-border"
            >
              {POINTS.map((p) => (
                <div
                  key={p.title}
                  className="flex flex-col gap-3 border-t border-border px-5 py-10 first:border-t-0 md:border-t-0 md:px-8 md:py-14"
                >
                  <HairlineFigure name={p.figure} title={p.title} />
                  <h2 className="text-lg font-semibold tracking-tight">{p.title}</h2>
                  <p className="text-sm leading-6 text-muted-foreground">{p.body}</p>
                </div>
              ))}
            </div>
          </section>

          <div id="inbox" data-reveal className="scroll-mt-20">
            <FeatureSection
              title="An inbox on your own domain"
              body="Replies from your contacts land in one inbox, on the same thread as what you sent. Attachments come through with the message, and risky content is blocked before you open it."
              href="/docs"
              linkLabel="Read the docs"
            >
              <InboxSlice />
            </FeatureSection>
          </div>
          <div id="campaigns" data-reveal className="scroll-mt-20">
            <FeatureSection
              flip
              title="Campaigns for everyone at once"
              body="Write one message and pick who receives it. A review checklist runs before you schedule it, each campaign email carries a one-click unsubscribe, and each person is sent it only once."
              href="/docs"
              linkLabel="Read the docs"
            >
              <CampaignsSlice />
            </FeatureSection>
          </div>
          <div id="delivery" data-reveal className="scroll-mt-20">
            <FeatureSection
              title="Every delivery, on record"
              body="Each message's status is recorded from queued to delivered, and failed sends retry automatically. Hard bounces and spam reports stop future sends, and your app hears about each one."
              href="/docs"
              linkLabel="Read the docs"
            >
              <DeliverySlice />
            </FeatureSection>
          </div>
          <div id="team" data-reveal className="scroll-mt-20">
            <FeatureSection
              flip
              title="A workspace for every client"
              body="Give each client a workspace of its own, bring your team into one place, and set limits per client."
              href="/docs"
              linkLabel="Read the docs"
            >
              <TeamSlice />
            </FeatureSection>
          </div>
          <div id="developers" data-reveal className="scroll-mt-20">
            <section className="border-t border-border">
              <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:gap-16 md:px-8 md:py-24">
                <div className="flex flex-col items-start gap-5">
                  <h2 className="text-3xl font-semibold tracking-[-0.022em] text-balance md:text-4xl">An API for your apps</h2>
                  <p className="max-w-md text-base leading-7 text-muted-foreground">
                    Create a key for each app and set a monthly quota for it. The OpenAPI docs let you try a request in the browser before you write any code.
                  </p>
                  <Link prefetch={false} href="/docs/api" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline md:min-h-0">
                    API reference
                    <ChevronRightIcon className="size-4" aria-hidden />
                  </Link>
                </div>
                <CodeSample />
              </div>
            </section>
          </div>

          <section data-reveal className="scroll-mt-20 border-t border-border">
            <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
              <h2 className="text-3xl font-semibold tracking-[-0.022em] text-balance md:text-4xl">Safe by default</h2>
              <div className="mt-10 grid md:grid-cols-4 md:divide-x md:divide-border">
                {SAFE.map((s) => (
                  <div key={s.title} className="flex flex-col gap-3 border-t border-border py-8 first:border-t-0 md:border-t-0 md:px-6 md:first:pl-0 md:last:pr-0">
                    <h3 className="text-lg font-semibold tracking-tight">{s.title}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">{s.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <ChannelStrip />
          <ContactSection />
        </main>
      </LandingScroll>
    </PublicShell>
  );
}
