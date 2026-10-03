import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { AudienceDef, CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";
import { enqueue, type UsersRef } from "./enqueue";
import type { Channel } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

const BATCH = 500;

export interface SystemCampaignDeps {
  db: Db;
  tables: NotificationTables & CampaignTables;
  users: UsersRef;
}

export interface SystemCampaignSeed {
  key: string;
  name: string;
  channels: Channel[];
  content: { channel: Channel; locale: string; subject: string; html?: string; text?: string; body?: string }[];
}

/**
 * Find the system campaign for `key`, creating it with `seed` content the first
 * time. Content is only ever seeded: once it exists, staff own the copy.
 */
export async function ensureSystemCampaign(deps: Pick<SystemCampaignDeps, "db" | "tables">, seed: SystemCampaignSeed) {
  const { db, tables } = deps;
  const [existing] = await db
    .select({ id: tables.campaign.id, publicId: tables.campaign.publicId })
    .from(tables.campaign)
    .where(eq(tables.campaign.systemKey, seed.key));
  if (existing) return existing as { id: bigint; publicId: string };

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(tables.campaign)
      .values({ name: seed.name, channels: seed.channels, audience: {} as AudienceDef, status: "sent", systemKey: seed.key })
      .onConflictDoNothing({ target: tables.campaign.systemKey })
      .returning({ id: tables.campaign.id, publicId: tables.campaign.publicId });
    // Lost a race with another request: the winner seeded the content.
    if (!row) {
      const [won] = await tx
        .select({ id: tables.campaign.id, publicId: tables.campaign.publicId })
        .from(tables.campaign)
        .where(eq(tables.campaign.systemKey, seed.key));
      return won as { id: bigint; publicId: string };
    }
    await tx.insert(tables.campaignContent).values(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      seed.content.map((c) => ({ ...c, campaignId: row.id }) as any),
    );
    return row as { id: bigint; publicId: string };
  });
}

/**
 * Send a system campaign to `recipients`. Re-runnable: `runKey` scopes the
 * dedupe key, so the same run (e.g. one menu week) reaches a recipient at most
 * once, while the next run reaches them again. Rows are marketing-kind, so an
 * unsubscribed or bounced address is dropped at enqueue like any campaign.
 */
export async function runSystemCampaign(
  deps: SystemCampaignDeps,
  key: string,
  input: { runKey: string; recipients: { userId: bigint; name?: string | null }[]; vars?: Record<string, unknown>; href?: string },
): Promise<{ queued: number } | { error: string; status: number }> {
  const { db, tables, users } = deps;
  const [campaign] = await db
    .select({ id: tables.campaign.id, publicId: tables.campaign.publicId, channels: tables.campaign.channels })
    .from(tables.campaign)
    .where(eq(tables.campaign.systemKey, key));
  if (!campaign) return { error: "System campaign not set up", status: 404 };

  const before = await db.$count(tables.notificationOutbox, eq(tables.notificationOutbox.campaignId, campaign.id));
  for (let i = 0; i < input.recipients.length; i += BATCH) {
    const slice = input.recipients.slice(i, i + BATCH);
    await db.transaction(async (tx) => {
      for (const r of slice) {
        await enqueue(tx, tables, users, {
          recipientId: r.userId,
          title: "",
          body: "",
          href: input.href,
          kind: "marketing",
          campaignId: campaign.id as bigint,
          channels: campaign.channels as Channel[],
          data: { contact: { name: r.name ?? "" }, ...(input.vars ?? {}) },
          dedupeKey: `cmp:${campaign.publicId}:${input.runKey}:${r.userId}`,
        });
      }
    });
  }
  // Counted from the outbox, not the loop: suppressed and already-sent recipients write no row.
  const queued =
    (await db.$count(tables.notificationOutbox, eq(tables.notificationOutbox.campaignId, campaign.id))) - before;

  await db
    .update(tables.campaign)
    .set({
      sentAt: Date.now(),
      counts: sql`jsonb_set(${tables.campaign.counts}, '{queued}',
        to_jsonb(COALESCE((${tables.campaign.counts} ->> 'queued')::int, 0) + ${queued}))`,
    })
    .where(eq(tables.campaign.id, campaign.id));

  return { queued };
}
