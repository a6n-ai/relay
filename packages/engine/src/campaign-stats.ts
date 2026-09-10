import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export interface CampaignStatsDeps {
  db: Db;
  tables: NotificationTables & CampaignTables;
}

/**
 * Attribute an SES event to its campaign via the provider message id stamped on
 * the outbox row when it was sent. A transactional send has no campaign_id, so
 * its events fall through as a no-op — the email_log row is its record.
 */
export async function recordCampaignEvent(
  deps: CampaignStatsDeps,
  providerMessageId: string,
  type: string,
): Promise<void> {
  const { db, tables } = deps;
  const [row] = await db
    .select({ campaignId: tables.notificationOutbox.campaignId })
    .from(tables.notificationOutbox)
    .where(eq(tables.notificationOutbox.providerMessageId, providerMessageId))
    .limit(1);
  if (!row?.campaignId) return;

  await db
    .update(tables.campaign)
    // jsonb_set with a coalesced default so the first event of a type creates it.
    .set({
      counts: sql`jsonb_set(${tables.campaign.counts}, ARRAY[${type}],
        to_jsonb(COALESCE((${tables.campaign.counts} ->> ${type})::int, 0) + 1))`,
    })
    .where(eq(tables.campaign.id, row.campaignId));
}
