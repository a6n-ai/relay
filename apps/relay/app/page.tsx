import type { Metadata } from "next";
import { Landing } from "@/components/marketing/landing";

export const metadata: Metadata = {
  title: "Relay - email, inbox and campaigns for your apps",
  description:
    "Send your apps' email and in-app messages from your own domain, keep every reply in one inbox, and see where each message landed.",
};

export default function Home() {
  return <Landing />;
}
