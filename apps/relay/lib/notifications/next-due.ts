import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { campaignTables, notificationTables, tenantWebhookDelivery } from "@/db/schema";

/** Epoch ms when the earliest waiting send, webhook retry or scheduled campaign is due; null when none. */
export async function nextDueAt(): Promise<number | null> {
  const o = notificationTables.notificationOutbox;
  const w = tenantWebhookDelivery;
  const c = campaignTables.campaign;
  const rows = (await db.execute(sql`select least(
    (select min(${o.nextAttemptAt}) from ${o} where ${o.status} = 'pending'),
    (select min(${w.nextAttemptAt}) from ${w} where ${w.status} = 'pending'),
    (select min(${c.scheduledAt}) from ${c} where ${c.status} = 'scheduled')
  ) as at`)) as unknown as { at: string | number | null }[];
  const at = rows[0]?.at;
  return at == null ? null : Number(at);
}
