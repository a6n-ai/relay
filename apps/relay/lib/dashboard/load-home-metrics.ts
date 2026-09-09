import { count, desc, gte, inArray, sql } from "drizzle-orm";
import type { Channel } from "@relay/engine";
import { DAY_MS, foldFortnightCells, type FortnightCell } from "@/components/ds/overview-stats";
import { db } from "@/db/client";
import { notificationTables, tenants } from "@/db/schema";

const CHANNELS: readonly Channel[] = ["email", "sms", "whatsapp", "in_app"];

function asChannel(value: string): Channel | null {
  return CHANNELS.includes(value as Channel) ? (value as Channel) : null;
}

export async function loadHomeMetrics(now = Date.now()) {
  const weekStart = now - 6 * DAY_MS;
  const priorStart = now - 13 * DAY_MS;
  const o = notificationTables.notificationOutbox;

  const [[{ tenantCount }], statusRows, recent, mixRows] = await Promise.all([
    db.select({ tenantCount: count() }).from(tenants),
    db
      .select({
        status: o.status,
        n: sql<number>`cast(count(*) as int)`,
      })
      .from(o)
      .where(inArray(o.status, ["pending", "failed"]))
      .groupBy(o.status),
    db
      .select({
        publicId: o.publicId,
        status: o.status,
        channel: o.channel,
        kind: o.kind,
        event: o.event,
        recipientEmail: o.recipientEmail,
        recipientPhone: o.recipientPhone,
        recipientExternalId: o.recipientExternalId,
      })
      .from(o)
      .orderBy(desc(o.createdAt))
      .limit(8),
    db
      .select({
        period: sql<string>`case when ${o.createdAt} >= ${weekStart} then 'this' else 'prior' end`.as("period"),
        dayIndex: sql<number>`cast(case when ${o.createdAt} >= ${weekStart} then floor((${o.createdAt} - ${weekStart})::numeric / ${DAY_MS}) else 0 end as int)`.as(
          "day_index",
        ),
        channel: o.channel,
        n: sql<number>`cast(count(*) as int)`,
      })
      .from(o)
      .where(gte(o.createdAt, priorStart))
      .groupBy(sql`1`, sql`2`, o.channel),
  ]);

  let pendingCount = 0;
  let failedCount = 0;
  for (const row of statusRows) {
    const n = Number(row.n) || 0;
    if (row.status === "pending") pendingCount = n;
    else if (row.status === "failed") failedCount = n;
  }

  const cells: FortnightCell[] = [];
  for (const row of mixRows) {
    const channel = asChannel(row.channel);
    if (!channel) continue;
    const period = row.period === "this" ? "this" : "prior";
    cells.push({
      period,
      dayIndex: Number(row.dayIndex) || 0,
      channel,
      n: Number(row.n) || 0,
    });
  }

  return {
    tenantCount,
    pendingCount,
    failedCount,
    recent,
    ...foldFortnightCells(cells),
  };
}
