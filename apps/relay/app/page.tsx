import type { Metadata } from "next";
import { Landing } from "@/components/marketing/landing";

export const metadata: Metadata = {
  title: "Relay — notifications that leave through one door",
  description:
    "Notification product for email, SMS, WhatsApp, and in-app. Tenants send with an API key. Operators run the outbox.",
};

export default function Home() {
  return (
    <>
      {/*
        THESIS: A send detonates into channels — not a SaaS hero with three cards.
        OWN-WORLD: Lyra night field, hairline gutters, sharp rects, Geist, purple only.
        STORY: Public product page — one POST, four channels; sign in to operate.
        FIRST VIEWPORT: Split — promise left, dispatch burst right; Sign in in the bar.
        FORM: Exploded-view dispatch (surface seed persuade).
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
      */}
      <Landing />
    </>
  );
}
