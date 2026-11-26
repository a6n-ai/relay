export type Kind = "sender" | "inbox" | "both";

export const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: "sender", label: "Send only", hint: "Your apps send email from this address. Mail sent to it is rejected." },
  { value: "inbox", label: "Receive only", hint: "Mail sent to this address shows up in Relay. Apps can't send from it." },
  { value: "both", label: "Send and receive", hint: "Your apps send from it, and replies show up in Relay." },
];

export const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.value, k.label]));

export const LOCAL_RE = /^[a-z0-9._-]+$/;
