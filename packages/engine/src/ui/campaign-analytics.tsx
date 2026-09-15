"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";

const STAGES = [
  { key: "queued", label: "Queued" },
  { key: "delivered", label: "Delivered" },
  { key: "opened", label: "Opened" },
  { key: "clicked", label: "Clicked" },
] as const;

// Matches the app's theme-aware chart tokens (--chart-1..5 in globals.css) —
// this package has no app-local CSS to import, so the var name is the contract.
const CHART_COLOR = "var(--color-chart-1)";

function FunnelTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md">
      <div className="text-muted-foreground mb-1 font-medium">{label}</div>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: p.color }} />
        <span className="font-medium tabular-nums">{p.value}</span>
      </div>
    </div>
  );
}

/** Queued→delivered→opened→clicked funnel as a bar chart, plus a bounce/complaint line. */
export function CampaignAnalytics({ counts }: { counts: Record<string, number> }) {
  const queued = counts.queued ?? 0;
  const bounced = counts.bounced ?? 0;
  const complained = counts.complained ?? 0;
  const bounceRate = queued > 0 ? Math.round((bounced / queued) * 100) : 0;

  const data = STAGES.map((s) => ({ stage: s.label, value: counts[s.key] ?? 0 }));

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="stage" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={36} allowDecimals={false} className="fill-muted-foreground" />
          <Tooltip content={(props) => <FunnelTooltip {...props} />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
          <Bar dataKey="value" fill={CHART_COLOR} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {(bounced > 0 || complained > 0) && (
        <div className="flex gap-4 border-t pt-3 text-sm">
          {bounced > 0 && (
            <span className="text-destructive">
              {bounced} bounced <span className="text-muted-foreground">({bounceRate}%)</span>
            </span>
          )}
          {complained > 0 && <span className="text-destructive">{complained} complained</span>}
        </div>
      )}
    </div>
  );
}
