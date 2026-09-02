import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { monthStartUtcMs } from "./quota";

export async function countTenantSendsThisMonth(tenantId: bigint, now = Date.now()): Promise<number> {
  const start = monthStartUtcMs(now);
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(notificationTables.notificationOutbox)
    .where(
      and(
        eq(notificationTables.notificationOutbox.tenantId, tenantId),
        gte(notificationTables.notificationOutbox.createdAt, start),
      ),
    );
  return count;
}
