import type { Env } from "../env";
import { type WebhookInput, type WebhookPatch } from "../core/webhooks";
import { clientFor } from "../do/client";
import type { Scope } from "../shared/scope";

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
