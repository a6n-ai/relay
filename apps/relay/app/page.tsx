import type { Metadata } from "next";
import { Landing } from "@/components/marketing/landing";

export const metadata: Metadata = {
  title: "Relay - one send, every channel",
  description:
    "Send email, texts, WhatsApp, and in-app messages from one place. Sign in to watch delivery.",
};

export default function Home() {
  return <Landing />;
}
