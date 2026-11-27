import { z } from "zod";
import { type WebhookEvent, WEBHOOK_EVENTS } from "../shared/mail";
import { URL_MAX } from "../shared/limits";

export type WebhookView = {
  id: string;
  appId: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

const PRIVATE_NAME = /(^|\.)(localhost|internal|local|localdomain)$/;

function isPublicIPv4(ip: number): boolean {
  const a = ip >>> 24;
  const b = (ip >>> 16) & 0xff;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && ((ip >>> 8) & 0xff) === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

// WHATWG URL hands over IPv6 hosts already compressed, so only the "::" form needs expanding.
function expandIPv6(addr: string): number[] {
  const [head = "", tail = ""] = addr.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const zeros = Array<string>(8 - headGroups.length - tailGroups.length).fill("0");
  return [...headGroups, ...zeros, ...tailGroups].map((group) => parseInt(group, 16));
}

const isZeroGroups = (groups: number[], from: number, to: number) => groups.slice(from, to).every((g) => g === 0);

// IPv6 literals that carry an IPv4 address; that address is judged by the IPv4 rules.
function embeddedIPv4(groups: number[]): number | undefined {
  const low32 = groups[6] * 0x10000 + groups[7];
  // ::/96 compatible, ::ffff:0:0/96 mapped, ::ffff:0:0:0/96 translated
  if (isZeroGroups(groups, 0, 5) && (groups[5] === 0 || groups[5] === 0xffff)) return low32;
  if (isZeroGroups(groups, 0, 4) && groups[4] === 0xffff && groups[5] === 0) return low32;
  // 64:ff9b::/96 NAT64
  if (groups[0] === 0x64 && groups[1] === 0xff9b && isZeroGroups(groups, 2, 6)) return low32;
  // 2002::/16 6to4 keeps the IPv4 address in bits 16-47
  if (groups[0] === 0x2002) return groups[1] * 0x10000 + groups[2];
  return undefined;
}

function isPublicIPv6(addr: string): boolean {
  const groups = expandIPv6(addr);
  const embedded = embeddedIPv4(groups);
  if (embedded !== undefined) return isPublicIPv4(embedded);
  const first = groups[0];
  return (first & 0xffc0) !== 0xfe80 && (first & 0xfe00) !== 0xfc00 && (first & 0xff00) !== 0xff00;
}

export function isPublicWebhookHost(hostname: string): boolean {
  const host = hostname.replace(/\.+$/, "");
  if (PRIVATE_NAME.test(host)) return false;
  if (host.startsWith("[")) return isPublicIPv6(host.slice(1, -1));
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return isPublicIPv4(host.split(".").reduce((n, part) => n * 256 + Number(part), 0));
  }
  return true;
}

// Also checked at delivery: a stored URL may predate a rule change.
export function isPublicWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && isPublicWebhookHost(url.hostname);
  } catch {
    return false;
  }
}

export const httpsUrl = z.string().max(URL_MAX).refine(isPublicWebhookUrl, "url must be a public https URL without credentials");

export type WebhookInput = { url: string; events: WebhookEvent[]; secret?: string; enabled?: boolean };
export type WebhookPatch = Partial<Omit<WebhookInput, "secret">>;
