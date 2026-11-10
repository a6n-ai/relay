import type { Channel } from "@relay/engine";

/** Linear-style coloured icons: one colour per kind of thing, from the --tag-* tokens. */
export type IconColor = "purple" | "blue" | "green" | "orange" | "yellow" | "red";

export const iconColorVar = (c: IconColor) => `var(--tag-${c})`;

export const CHANNEL_ICON_COLOR = {
  email: "blue",
  sms: "orange",
  whatsapp: "green",
  in_app: "purple",
} as const satisfies Record<Channel, IconColor>;
