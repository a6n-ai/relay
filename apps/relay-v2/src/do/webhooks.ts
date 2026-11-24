import { and, asc, eq } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type { WebhookEvent, WebhookView } from "../core/webhooks";
import * as schema from "./client-schema";

export type WebhookRow = typeof schema.webhook.$inferSelect;

export function toWebhookView(row: WebhookRow): WebhookView {
  return {
    id: row.id,
    appId: row.appId,
    url: row.url,
    events: JSON.parse(row.events) as WebhookEvent[],
    enabled: row.enabled === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listWebhookRows(db: DrizzleSqliteDODatabase<typeof schema>, appId: string): WebhookRow[] {
  return db
    .select()
    .from(schema.webhook)
    .where(eq(schema.webhook.appId, appId))
    .orderBy(asc(schema.webhook.createdAt))
    .all();
}

export function updateWebhookRow(
  db: DrizzleSqliteDODatabase<typeof schema>,
  appId: string,
  id: string,
  set: Partial<Pick<WebhookRow, "url" | "events" | "enabled">> & { updatedAt: number },
): WebhookRow | undefined {
  return db
    .update(schema.webhook)
    .set(set)
    .where(and(eq(schema.webhook.id, id), eq(schema.webhook.appId, appId)))
    .returning()
    .all()[0];
}

// Terminal: the lease is cleared and the row can never be claimed again.
export function failDeliveryRow(db: DrizzleSqliteDODatabase<typeof schema>, id: string, error: string, now: number): void {
  db.update(schema.webhookDelivery)
    .set({ status: "failed", lastError: error, claimedUntil: null, updatedAt: now })
    .where(and(eq(schema.webhookDelivery.id, id), eq(schema.webhookDelivery.status, "pending")))
    .run();
}

export function deleteWebhookRow(db: DrizzleSqliteDODatabase<typeof schema>, appId: string, id: string): boolean {
  return (
    db
      .delete(schema.webhook)
      .where(and(eq(schema.webhook.id, id), eq(schema.webhook.appId, appId)))
      .returning({ id: schema.webhook.id })
      .all().length > 0
  );
}
