import { notFound } from "next/navigation";
import { InboxIcon, MailIcon, MessageCircleIcon, SmartphoneIcon, type LucideIcon } from "lucide-react";
import { StubPage } from "@/components/ds";
import { RELAY_CHANNELS } from "@/components/ds/channels";
import type { Channel } from "@relay/engine";

const SLUG_TO_CHANNEL: Record<string, Channel> = {
  email: "email",
  sms: "sms",
  whatsapp: "whatsapp",
  "in-app": "in_app",
};

const ICONS: Record<Channel, LucideIcon> = {
  email: MailIcon,
  sms: SmartphoneIcon,
  whatsapp: MessageCircleIcon,
  in_app: InboxIcon,
};

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channel: string }>;
}) {
  const { channel: slug } = await params;
  const key = SLUG_TO_CHANNEL[slug];
  if (!key) notFound();
  const meta = RELAY_CHANNELS.find((c) => c.key === key);
  if (!meta) notFound();

  return (
    <StubPage
      icon={ICONS[key]}
      title={meta.label}
      subtitle={meta.hint}
      message="Settings for this way of reaching people will live here. Use Email sending to connect mail today."
    />
  );
}
