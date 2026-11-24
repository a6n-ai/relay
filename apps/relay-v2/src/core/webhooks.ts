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

const httpsUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.username === "" && url.password === "";
    } catch {
      return false;
    }
  }, "url must be an https URL without credentials");

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
