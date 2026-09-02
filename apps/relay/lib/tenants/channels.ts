import type { Channel } from "@relay/engine";
import { EMAIL_API_CHANNEL } from "@/db/schema";

const GRANTABLE: Channel[] = [EMAIL_API_CHANNEL];

export function parseApiKeyChannels(formData: FormData): Channel[] {
  const raw = formData.getAll("channels").map((v) => String(v));
  const channels = GRANTABLE.filter((c) => raw.includes(c));
  return channels.length > 0 ? channels : [EMAIL_API_CHANNEL];
}

export function channelAllowed(keyChannels: string[], requested: Channel[]): Channel[] {
  return requested.filter((c) => keyChannels.includes(c));
}

export function deniedChannels(keyChannels: string[], requested: Channel[]): Channel[] {
  return requested.filter((c) => !keyChannels.includes(c));
}
