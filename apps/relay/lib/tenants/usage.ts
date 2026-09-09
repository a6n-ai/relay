import { and, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { monthStartUtcMs } from "./quota";

export async function countTenantSendsThisMonth(tenantId: bigint, now = Date.now()): Promise<number> {
  const map = await countTenantsSendsThisMonth([tenantId], now);
  return map.get(String(tenantId)) ?? 0;
}

export async function countTenantsSendsThisMonth(
  tenantIds: bigint[],
  now = Date.now(),
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (tenantIds.length === 0) return out;
  const start = monthStartUtcMs(now);
  const o = notificationTables.notificationOutbox;
  const rows = await db
    .select({
      tenantId: o.tenantId,
      n: sql<number>`cast(count(*) as int)`,
    })
    .from(o)
    .where(and(inArray(o.tenantId, tenantIds), gte(o.createdAt, start)))
    .groupBy(o.tenantId);
  for (const row of rows) out.set(String(row.tenantId), Number(row.n) || 0);
  return out;
}
