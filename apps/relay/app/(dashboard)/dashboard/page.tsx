import { count, desc, eq, gte } from "drizzle-orm";
import { InboxIcon, UsersIcon, XCircleIcon } from "lucide-react";
import { ChannelDistribution } from "@/components/ds/channel-distribution";
import { ChannelPerformance } from "@/components/ds/channel-performance";
import { DotRule } from "@/components/ds/dot-rule";
import { KeyInsightsCard } from "@/components/ds/key-insights-card";
import { KpiActionCard } from "@/components/ds/kpi-tile";
import { OverviewFrame, OverviewSlot } from "@/components/ds/overview-frame";
import { OverviewGreeting } from "@/components/ds/overview-greeting";
import {
  DAY_MS,
  countByChannel,
  lastSevenDayChannelBuckets,
  percentDelta,
} from "@/components/ds/overview-stats";
import { RecentOutboxCard } from "@/components/ds/recent-outbox-card";
import { ThroughputCard } from "@/components/ds/throughput-card";
import { db } from "@/db/client";
import { notificationTables, tenants } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  const now = Date.now();
  const weekStart = now - 6 * DAY_MS;
  const priorStart = now - 13 * DAY_MS;

  const [[{ tenantCount }], [{ pendingCount }], [{ failedCount }], recent, fortnight] =
    await Promise.all([
      db.select({ tenantCount: count() }).from(tenants),
      db
        .select({ pendingCount: count() })
        .from(notificationTables.notificationOutbox)
        .where(eq(notificationTables.notificationOutbox.status, "pending")),
      db
        .select({ failedCount: count() })
        .from(notificationTables.notificationOutbox)
        .where(eq(notificationTables.notificationOutbox.status, "failed")),
      db
        .select()
        .from(notificationTables.notificationOutbox)
        .orderBy(desc(notificationTables.notificationOutbox.createdAt))
        .limit(8),
      db
        .select({
          createdAt: notificationTables.notificationOutbox.createdAt,
          channel: notificationTables.notificationOutbox.channel,
        })
        .from(notificationTables.notificationOutbox)
        .where(gte(notificationTables.notificationOutbox.createdAt, priorStart)),
    ]);

  const thisWeek = fortnight.filter((r) => r.createdAt >= weekStart);
  const priorWeek = fortnight.filter((r) => r.createdAt < weekStart);
  const buckets = lastSevenDayChannelBuckets(thisWeek, now);
  const priorMix = countByChannel(priorWeek);
  const weekTotal = buckets.totals.reduce((a, b) => a + b, 0);
  const volumeDelta = percentDelta(weekTotal, priorWeek.length);

  const channelDeltas = {
    email: percentDelta(buckets.channelTotals.email, priorMix.email),
    sms: percentDelta(buckets.channelTotals.sms, priorMix.sms),
    whatsapp: percentDelta(buckets.channelTotals.whatsapp, priorMix.whatsapp),
    in_app: percentDelta(buckets.channelTotals.in_app, priorMix.in_app),
  };

  const firstName =
    session?.user.name.trim().split(/\s+/)[0] || session?.user.email.split("@")[0] || "there";

  return (
    <OverviewFrame>
      <OverviewSlot span={8}>
        <OverviewGreeting name={firstName} />
      </OverviewSlot>
      <OverviewSlot span={4}>
        <KeyInsightsCard total={weekTotal} delta={volumeDelta} mix={buckets.channelTotals} />
      </OverviewSlot>
      <OverviewSlot className="bg-transparent">
        <DotRule />
      </OverviewSlot>
      <OverviewSlot span={7}>
        <ThroughputCard total={weekTotal} byChannel={buckets.byChannel} delta={volumeDelta} />
      </OverviewSlot>
      <OverviewSlot span={5}>
        <ChannelDistribution counts={buckets.channelTotals} deltas={channelDeltas} />
      </OverviewSlot>
      <OverviewSlot className="bg-transparent">
        <DotRule />
      </OverviewSlot>
      <OverviewSlot span={4}>
        <KpiActionCard
          item={{
            label: "Apps",
            value: tenantCount,
            href: "/dashboard/tenants",
            icon: UsersIcon,
          }}
        />
      </OverviewSlot>
      <OverviewSlot span={4}>
        <KpiActionCard
          item={{
            label: "Waiting",
            value: pendingCount,
            href: "/dashboard/logs",
            icon: InboxIcon,
            tone: pendingCount > 0 ? "neutral" : "ok",
            delta: pendingCount > 0 ? "in line" : "clear",
          }}
        />
      </OverviewSlot>
      <OverviewSlot span={4}>
        <KpiActionCard
          item={{
            label: "Didn’t send",
            value: failedCount,
            href: "/dashboard/logs",
            icon: XCircleIcon,
            tone: failedCount > 0 ? "bad" : "ok",
            delta: failedCount > 0 ? "needs a look" : "clear",
          }}
        />
      </OverviewSlot>
      <OverviewSlot className="bg-transparent">
        <DotRule />
      </OverviewSlot>
      <OverviewSlot span={4}>
        <ChannelPerformance counts={buckets.channelTotals} />
      </OverviewSlot>
      <OverviewSlot span={8}>
        <RecentOutboxCard rows={recent} />
      </OverviewSlot>
    </OverviewFrame>
  );
}
