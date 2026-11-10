import { SendDemo } from "./demo/send-demo";
import { CampaignsSlice, InboxSlice } from "./demo/slices";
import { FeatureSection } from "./feature-section";
import { HairlineFigure } from "./hairline-figure";
import { PillLink } from "./pill-link";
import { PublicShell } from "./public-shell";

const POINTS = [
  {
    figure: "sorter" as const,
    title: "One send, every channel",
    body: "Post a message once. Relay delivers it by email, text, WhatsApp and in the app.",
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

export function Landing() {
  return (
    <PublicShell>
      <main>
        <section className="mx-auto max-w-6xl px-5 pt-16 md:px-8 md:pt-20">
          <h1 className="max-w-3xl text-5xl leading-[1.05] font-semibold tracking-[-0.022em] text-balance md:text-[64px]">
            One send. Every channel.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-7 text-muted-foreground">
            Relay sends email, texts, WhatsApp and in-app messages from one place, and shows you every delivery.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PillLink href="/login">Sign in</PillLink>
            <PillLink href="/docs" tone="ghost">
              Read the docs
            </PillLink>
          </div>
        </section>
        <div className="relative mt-12 overflow-hidden md:mt-16">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,color-mix(in_srgb,var(--foreground)_9%,transparent),transparent_75%)]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-[1096px] px-3 md:px-8">
            <SendDemo />
          </div>
        </div>

        <section className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-32">
          <p className="max-w-4xl text-2xl leading-snug font-semibold tracking-[-0.022em] text-balance md:text-4xl md:leading-[1.2]">
            Relay is where your apps send from.{" "}
            <span className="text-muted-foreground">
              Every message leaves once, reaches people on the channel they use, and you can see where each one landed.
            </span>
          </p>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto grid max-w-6xl md:grid-cols-3 md:divide-x md:divide-border">
            {POINTS.map((p) => (
              <div key={p.title} className="flex flex-col gap-3 border-t border-border px-5 py-10 first:border-t-0 md:border-t-0 md:px-8 md:py-14">
                <HairlineFigure name={p.figure} title={p.title} />
                <h2 className="text-lg font-semibold tracking-tight">{p.title}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <FeatureSection
          title="An inbox on your own domain"
          body="Give each person a mailbox on your domain. Replies land beside what you sent, in one conversation."
          href="/docs"
          linkLabel="Read the docs"
        >
          <InboxSlice />
        </FeatureSection>
        <FeatureSection
          flip
          title="Campaigns for everyone at once"
          body="Write one message, pick the people and the channels, and watch it go out."
          href="/docs"
          linkLabel="Read the docs"
        >
          <CampaignsSlice />
        </FeatureSection>

        <section className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-5 py-24 text-center md:px-8 md:py-32">
            <h2 className="text-4xl font-semibold tracking-[-0.022em] text-balance md:text-5xl">Send your first message.</h2>
            <div className="flex flex-wrap justify-center gap-3">
              <PillLink href="/login">Sign in</PillLink>
              <PillLink href="/docs" tone="ghost">
                Read the docs
              </PillLink>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
