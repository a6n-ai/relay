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
 * the outbox row when it was sent. Delivery/Open are also stamped on the row
 * itself; a transactional send has no campaign_id, so that is all it records.
 */
export async function recordCampaignEvent(
  deps: CampaignStatsDeps,
  providerMessageId: string,
  type: string,
): Promise<void> {
  const { db, tables } = deps;
  const o = tables.notificationOutbox;
  const [row] = await db
    .select({ id: o.id, campaignId: o.campaignId })
    .from(o)
    .where(eq(o.providerMessageId, providerMessageId))
    .limit(1);
  if (!row) return;

  // Per-message state, for every send (transactional too): first event wins.
  const stamp = type === "delivered" ? o.deliveredAt : type === "opened" ? o.openedAt : undefined;
  if (stamp) {
    await db
      .update(o)
      .set({ [type === "delivered" ? "deliveredAt" : "openedAt"]: sql`coalesce(${stamp}, ${Date.now()})` })
      .where(eq(o.id, row.id));
  }
  if (!row.campaignId) return;

  await db
    .update(tables.campaign)
    // jsonb_set with a coalesced default so the first event of a type creates it.
    .set({
      counts: sql`jsonb_set(${tables.campaign.counts}, ARRAY[${type}],
        to_jsonb(COALESCE((${tables.campaign.counts} ->> ${type})::int, 0) + 1))`,
    })
    .where(eq(tables.campaign.id, row.campaignId));
}
