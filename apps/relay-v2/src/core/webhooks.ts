import { z } from "zod";
import type { Env } from "../env";
import { clientFor, type Scope } from "./messages";

export const WEBHOOK_EVENTS = ["mailbox.received"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

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
    (a === 192 && b === 168)
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

function isPublicIPv6(addr: string): boolean {
  const groups = expandIPv6(addr);
  // ::/96 and ::ffff:0:0/96 carry an IPv4 address in the last 32 bits.
  if (groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0 || groups[5] === 0xffff)) {
    return isPublicIPv4(groups[6] * 0x10000 + groups[7]);
  }
  const first = groups[0];
  return (first & 0xffc0) !== 0xfe80 && (first & 0xfe00) !== 0xfc00 && (first & 0xff00) !== 0xff00;
}

export function isPublicWebhookHost(hostname: string): boolean {
  const host = hostname.replace(/\.$/, "");
  if (PRIVATE_NAME.test(host)) return false;
  if (host.startsWith("[")) return isPublicIPv6(host.slice(1, -1));
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return isPublicIPv4(host.split(".").reduce((n, part) => n * 256 + Number(part), 0));
  }
  return true;
}

const httpsUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.username === "" &&
        url.password === "" &&
        isPublicWebhookHost(url.hostname)
      );
    } catch {
      return false;
    }
  }, "url must be a public https URL without credentials");

export const webhookInputSchema = z.object({
  url: httpsUrl,
  events: z
    .array(z.enum(WEBHOOK_EVENTS))
    .min(1)
    .transform((events) => [...new Set(events)]),
  secret: z.string().min(16).max(256).optional(),
  enabled: z.boolean().optional(),
});

export const webhookPatchSchema = webhookInputSchema.omit({ secret: true }).partial();

export type WebhookInput = z.output<typeof webhookInputSchema>;
export type WebhookPatch = z.output<typeof webhookPatchSchema>;

export function createWebhookForScope(env: Env, scope: Scope, input: WebhookInput) {
  return clientFor(env, scope.workspaceId).createWebhook(scope.workspaceId, scope.appId, input);
}

export function listWebhooksForScope(env: Env, scope: Scope) {
  return clientFor(env, scope.workspaceId).listWebhooks(scope.workspaceId, scope.appId);
}

export function updateWebhookForScope(env: Env, scope: Scope, id: string, patch: WebhookPatch) {
  return clientFor(env, scope.workspaceId).updateWebhook(scope.workspaceId, scope.appId, id, patch);
}

export function deleteWebhookForScope(env: Env, scope: Scope, id: string) {
  return clientFor(env, scope.workspaceId).deleteWebhook(scope.workspaceId, scope.appId, id);
}
