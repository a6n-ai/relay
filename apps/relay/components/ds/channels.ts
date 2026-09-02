import type { Channel } from "@relay/engine";

export const RELAY_CHANNELS: readonly {
  key: Channel;
  label: string;
  href: string;
  hint: string;
}[] = [
  { key: "email", label: "Email", href: "/dashboard/channels/email", hint: "Letters to the inbox" },
  { key: "sms", label: "Text", href: "/dashboard/channels/sms", hint: "Short phone messages" },
  { key: "whatsapp", label: "WhatsApp", href: "/dashboard/channels/whatsapp", hint: "Chat-style messages" },
  { key: "in_app", label: "In the app", href: "/dashboard/channels/in-app", hint: "Bell and inbox inside the product" },
];

export function channelLabel(key: Channel): string {
  switch (key) {
    case "email":
      return "Email";
    case "sms":
      return "Text";
    case "whatsapp":
      return "WhatsApp";
    case "in_app":
      return "In the app";
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}
