import { sql } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { usageDaily } from "../db/core/schema";
import type { Env } from "../env";

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Best-effort: usage never fails the job that produced it.
export async function bumpUsage(
  env: Env,
  workspaceId: string,
  day: string,
  delta: { sent?: number; delivered?: number; bounced?: number; inbound?: number },
): Promise<void> {
  const now = new Date();
  try {
    await coreDb(env)
      .insert(usageDaily)
      .values({
        workspaceId,
        day,
        sent: delta.sent ?? 0,
        delivered: delta.delivered ?? 0,
        bounced: delta.bounced ?? 0,
        inbound: delta.inbound ?? 0,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [usageDaily.workspaceId, usageDaily.day],
        set: {
          sent: sql`${usageDaily.sent} + excluded.sent`,
          delivered: sql`${usageDaily.delivered} + excluded.delivered`,
          bounced: sql`${usageDaily.bounced} + excluded.bounced`,
          inbound: sql`${usageDaily.inbound} + excluded.inbound`,
          updatedAt: now,
        },
      });
  } catch (err) {
    console.error("usage: failed to bump usage_daily", workspaceId, day, err);
  }
}
