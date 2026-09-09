import { InboxIcon, UsersIcon, XCircleIcon } from "lucide-react";
import { ChannelDistribution } from "@/components/ds/channel-distribution";
import { ChannelPerformance } from "@/components/ds/channel-performance";
import { DotRule } from "@/components/ds/dot-rule";
import { KeyInsightsCard } from "@/components/ds/key-insights-card";
import { KpiActionCard } from "@/components/ds/kpi-tile";
import { OverviewFrame, OverviewSlot } from "@/components/ds/overview-frame";
import { OverviewGreeting } from "@/components/ds/overview-greeting";
import { percentDelta } from "@/components/ds/overview-stats";
import { RecentOutboxCard } from "@/components/ds/recent-outbox-card";
import { ThroughputCard } from "@/components/ds/throughput-card";
import { loadHomeMetrics } from "@/lib/dashboard/load-home-metrics";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [session, metrics] = await Promise.all([getSession(), loadHomeMetrics()]);
  const { tenantCount, pendingCount, failedCount, recent, totals, byChannel, channelTotals, priorMix } =
    metrics;
  const weekTotal = totals.reduce((a, b) => a + b, 0);
  const volumeDelta = percentDelta(weekTotal, priorMix.email + priorMix.sms + priorMix.whatsapp + priorMix.in_app);
  const channelDeltas = {
    email: percentDelta(channelTotals.email, priorMix.email),
    sms: percentDelta(channelTotals.sms, priorMix.sms),
    whatsapp: percentDelta(channelTotals.whatsapp, priorMix.whatsapp),
    in_app: percentDelta(channelTotals.in_app, priorMix.in_app),
  };

  const firstName =
    session?.user.name.trim().split(/\s+/)[0] || session?.user.email.split("@")[0] || "there";

  return (
    <OverviewFrame>
      <OverviewSlot span={8}>
        <OverviewGreeting name={firstName} />
      </OverviewSlot>
      <OverviewSlot span={4}>
        <KeyInsightsCard total={weekTotal} delta={volumeDelta} mix={channelTotals} />
      </OverviewSlot>
      <OverviewSlot className="bg-transparent">
        <DotRule />
      </OverviewSlot>
      <OverviewSlot span={7}>
        <ThroughputCard total={weekTotal} byChannel={byChannel} delta={volumeDelta} />
      </OverviewSlot>
      <OverviewSlot span={5}>
        <ChannelDistribution counts={channelTotals} deltas={channelDeltas} />
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
        <ChannelPerformance counts={channelTotals} />
      </OverviewSlot>
      <OverviewSlot span={8}>
        <RecentOutboxCard rows={recent} />
      </OverviewSlot>
    </OverviewFrame>
  );
}
