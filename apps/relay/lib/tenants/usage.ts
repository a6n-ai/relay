import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTables, tenants } from "@/db/schema";
import { monthStartUtcMs } from "./quota";

/** `status: "sent"` counts delivered rows only; omit it to count every queued row. */
export async function countTenantSendsThisMonth(tenantId: bigint, now = Date.now(), status?: "sent"): Promise<number> {
  const map = await countTenantsSendsThisMonth([tenantId], now, status);
  return map.get(String(tenantId)) ?? 0;
}

export async function countTenantsSendsThisMonth(
  tenantIds: bigint[],
  now = Date.now(),
  status?: "sent",
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
    .where(and(inArray(o.tenantId, tenantIds), gte(o.createdAt, start), status ? eq(o.status, status) : undefined))
    .groupBy(o.tenantId);
  for (const row of rows) out.set(String(row.tenantId), Number(row.n) || 0);
  return out;
}

/** Sum of outbox rows this month for every app in a workspace. */
export async function countOrganizationSendsThisMonth(
  organizationId: string,
  now = Date.now(),
  status?: "sent",
): Promise<number> {
  const apps = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.organizationId, organizationId));
  if (apps.length === 0) return 0;
  const map = await countTenantsSendsThisMonth(
    apps.map((a) => a.id),
    now,
    status,
  );
  let total = 0;
  for (const n of map.values()) total += n;
  return total;
}
