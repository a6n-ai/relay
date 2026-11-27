import { clientFor } from "../core/messages";
import { createWebhookForScope, deleteWebhookForScope, listWebhooksForScope, updateWebhookForScope, type WebhookPatch, type WebhookView } from "../core/webhooks";
import { decodeCursor } from "../do/console-reads";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { allows } from "../lib/auth/permissions";
import { type ConsoleActor } from "./actor";
import { getApp } from "./apps";
import { grantedAddressIds } from "./messages";
import { RelayError, codeOf } from "../shared/errors";
import { type WebhookEvent } from "../shared/mail";

const scopeOf = (actor: ConsoleActor, appId: string) => ({ workspaceId: actor.workspaceId, appId });

export async function listWebhooksFor(env: Env, actor: ConsoleActor, appId: string): Promise<WebhookView[]> {
  await getApp(env, actor, appId);
  return listWebhooksForScope(env, scopeOf(actor, appId));
}

export async function listDeliveriesFor(env: Env, actor: ConsoleActor, appId: string, webhookId: string, cursor?: string) {
  await getApp(env, actor, appId);
  if (cursor !== undefined && !decodeCursor(cursor)) throw new RelayError("invalid cursor");
  const webhook = (await listWebhooksForScope(env, scopeOf(actor, appId))).find((w) => w.id === webhookId);
  if (!webhook) throw new RelayError("not found");
  const visible = allows(actor.roles, { webhook: ["log_all"] }) ? "all" : await grantedAddressIds(env, actor);
  const page = await clientFor(env, actor.workspaceId).listWebhookDeliveries(actor.workspaceId, appId, webhookId, visible, cursor);
  // Explicit fields: a spread of the RPC result would carry its Symbol.dispose member into the serialized loader data.
  return { webhook, rows: page.rows, nextCursor: page.nextCursor };
}

// The plaintext secret is returned here once and never stored; the audit row carries ids only.
export async function createWebhookFor(
  env: Env,
  actor: ConsoleActor,
  appId: string,
  input: { url: string; events: WebhookEvent[]; enabled?: boolean },
): Promise<{ webhook: WebhookView; secret: string }> {
  await getApp(env, actor, appId);
  let created: { webhook: WebhookView; secret: string };
  try {
    created = await createWebhookForScope(env, scopeOf(actor, appId), {
      url: input.url,
      events: input.events,
      enabled: input.enabled,
    });
  } catch (err) {
    if (codeOf(err) === "webhook key not configured") throw new RelayError("webhooks unavailable");
    throw err;
  }
  await writeAudit(env, {
    action: "webhook.create",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: created.webhook.id,
    data: { appId },
  });
  return created;
}

export async function updateWebhookFor(
  env: Env,
  actor: ConsoleActor,
  appId: string,
  id: string,
  patch: WebhookPatch,
): Promise<WebhookView> {
  await getApp(env, actor, appId);
  const view = await updateWebhookForScope(env, scopeOf(actor, appId), id, patch);
  if (!view) throw new RelayError("not found");
  await writeAudit(env, {
    action: "webhook.update",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: id,
    data: { appId },
  });
  return view;
}

export async function deleteWebhookFor(env: Env, actor: ConsoleActor, appId: string, id: string): Promise<void> {
  await getApp(env, actor, appId);
  if (!(await deleteWebhookForScope(env, scopeOf(actor, appId), id))) throw new RelayError("not found");
  await writeAudit(env, {
    action: "webhook.delete",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: id,
    data: { appId },
  });
}

export async function retryDeliveryFor(env: Env, actor: ConsoleActor, appId: string, deliveryId: string): Promise<void> {
  await getApp(env, actor, appId);
  const outcome = await clientFor(env, actor.workspaceId).retryWebhookDelivery(actor.workspaceId, appId, deliveryId);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "not_failed") throw new RelayError("delivery not failed");
  if (outcome === "webhook_disabled") throw new RelayError("webhook disabled");
  await writeAudit(env, {
    action: "webhook.retry",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: deliveryId,
    data: { appId },
  });
}
