import type { Channel } from "@relay/engine";

export const RELAY_CHANNELS: readonly {
  key: Channel;
  label: string;
  href: string;
  hint: string;
}[] = [
  { key: "email", label: "Email", href: "/dashboard/channels/email", hint: "SES / SMTP" },
  { key: "sms", label: "SMS", href: "/dashboard/channels/sms", hint: "Handler-ready" },
  { key: "whatsapp", label: "WhatsApp", href: "/dashboard/channels/whatsapp", hint: "Handler-ready" },
  { key: "in_app", label: "In-app", href: "/dashboard/channels/in-app", hint: "Feed + bell" },
];

export function channelLabel(key: Channel): string {
  switch (key) {
    case "email":
      return "Email";
    case "sms":
      return "SMS";
    case "whatsapp":
      return "WhatsApp";
    case "in_app":
      return "In-app";
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}
