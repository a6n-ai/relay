import { and, asc, eq, gte, lt } from "drizzle-orm";
import { utcDay } from "../core/usage";
import { getWorkspaceProfile } from "../core/workspace-profile";
import { coreDb } from "../db/core/client";
import { usageDaily } from "../db/core/schema";
import type { Env } from "../env";
import type { ConsoleActor } from "./actor";

export type Overview = {
  month: string;
  quota: number;
  sent: number;
  delivered: number;
  bounced: number;
  inbound: number;
  days: { day: string; sent: number; inbound: number }[];
};

// quota 0 means unlimited.
export async function getOverview(env: Env, actor: ConsoleActor, now = Date.now()): Promise<Overview> {
  const d = new Date(now);
  const monthStart = utcDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const nextMonthStart = utcDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const [rows, profile] = await Promise.all([
    coreDb(env)
      .select({
        day: usageDaily.day,
        sent: usageDaily.sent,
        delivered: usageDaily.delivered,
        bounced: usageDaily.bounced,
        inbound: usageDaily.inbound,
      })
      .from(usageDaily)
      .where(
        and(
          eq(usageDaily.workspaceId, actor.workspaceId),
          gte(usageDaily.day, monthStart),
          lt(usageDaily.day, nextMonthStart),
        ),
      )
      .orderBy(asc(usageDaily.day)),
    getWorkspaceProfile(env, actor.workspaceId),
  ]);

  const total = { sent: 0, delivered: 0, bounced: 0, inbound: 0 };
  for (const r of rows) {
    total.sent += r.sent;
    total.delivered += r.delivered;
    total.bounced += r.bounced;
    total.inbound += r.inbound;
  }
  return {
    month: monthStart.slice(0, 7),
    quota: profile.monthlyMessageQuota,
    ...total,
    days: rows.map((r) => ({ day: r.day, sent: r.sent, inbound: r.inbound })),
  };
}
