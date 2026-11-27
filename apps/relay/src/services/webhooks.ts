import { decodeCursor } from "../core/cursor";
import type { ConsoleActor } from "../core/session";
import { type WebhookInput, type WebhookPatch, type WebhookView } from "../core/webhooks";
import { clientFor } from "../do/client";
import type { Env } from "../env";
import { allows } from "../lib/auth/permissions";
import { RelayError, codeOf } from "../shared/errors";
import { grantedAddressIds } from "./inbox";
import { appFor, audit, fromActor, type Principal } from "./principal";

export async function listWebhooks(env: Env, p: Principal, appId: string): Promise<WebhookView[]> {
  await appFor(env, p, appId);
  return clientFor(env, p.workspaceId).listWebhooks(p.workspaceId, appId);
}

// Console only: what a reader sees depends on their role and the addresses they were granted.
export async function listDeliveries(env: Env, actor: ConsoleActor, appId: string, webhookId: string, cursor?: string) {
  const p = fromActor(actor);
  if (cursor !== undefined && !decodeCursor(cursor)) throw new RelayError("invalid cursor");
  const webhook = (await listWebhooks(env, p, appId)).find((w) => w.id === webhookId);
  if (!webhook) throw new RelayError("not found");
  const visible = allows(actor.roles, { webhook: ["log_all"] }) ? "all" : await grantedAddressIds(env, actor);
  const page = await clientFor(env, actor.workspaceId).listWebhookDeliveries(actor.workspaceId, appId, webhookId, visible, cursor);
  // Explicit fields: a spread of the RPC result would carry its Symbol.dispose member into the serialized loader data.
  return { webhook, rows: page.rows, nextCursor: page.nextCursor };
}

// The plaintext secret is returned here once and never stored; the audit row carries ids only.
export async function createWebhook(
  env: Env,
  p: Principal,
  appId: string,
  input: WebhookInput,
): Promise<{ webhook: WebhookView; secret: string }> {
  await appFor(env, p, appId);
  let created: { webhook: WebhookView; secret: string };
  try {
    created = await clientFor(env, p.workspaceId).createWebhook(p.workspaceId, appId, input);
  } catch (err) {
    if (codeOf(err) === "webhook key not configured") throw new RelayError("webhooks unavailable");
    throw err;
  }
  await audit(env, p, "webhook.create", created.webhook.id, { appId });
  return created;
}

export async function updateWebhook(env: Env, p: Principal, appId: string, id: string, patch: WebhookPatch): Promise<WebhookView> {
  await appFor(env, p, appId);
  const view = await clientFor(env, p.workspaceId).updateWebhook(p.workspaceId, appId, id, patch);
  if (!view) throw new RelayError("not found");
  await audit(env, p, "webhook.update", id, { appId });
  return view;
}

export async function deleteWebhook(env: Env, p: Principal, appId: string, id: string): Promise<void> {
  await appFor(env, p, appId);
  if (!(await clientFor(env, p.workspaceId).deleteWebhook(p.workspaceId, appId, id))) throw new RelayError("not found");
  await audit(env, p, "webhook.delete", id, { appId });
}

export async function retryDelivery(env: Env, p: Principal, appId: string, deliveryId: string): Promise<void> {
  await appFor(env, p, appId);
  const outcome = await clientFor(env, p.workspaceId).retryWebhookDelivery(p.workspaceId, appId, deliveryId);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_failed") throw new RelayError("delivery not failed");
  if (outcome === "webhook_disabled") throw new RelayError("webhook disabled");
  await audit(env, p, "webhook.retry", deliveryId, { appId });
}
