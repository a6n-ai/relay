"use client";

import { CheckCircle2Icon, MailWarningIcon, MousePointerClickIcon, SendIcon } from "lucide-react";
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

// One hue, four steps light -> dark — a sequential ramp for one funnel
// metric narrowing stage by stage, not four unrelated categorical colors.
const STAGES = [
  { key: "queued", label: "Queued", icon: SendIcon, mix: "100%" },
  { key: "delivered", label: "Delivered", icon: CheckCircle2Icon, mix: "78%" },
  { key: "opened", label: "Opened", icon: MailWarningIcon, mix: "58%" },
  { key: "clicked", label: "Clicked", icon: MousePointerClickIcon, mix: "42%" },
] as const;

function Ring({
  label,
  Icon,
  value,
  pctOfQueued,
  pctOfPrev,
  color,
}: {
  label: string;
  Icon: typeof SendIcon;
  value: number;
  pctOfQueued: number;
  pctOfPrev: number | null;
  color: string;
}) {
  const data = [{ value: pctOfQueued, fill: color }];
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative size-28">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            data={data}
            startAngle={90}
            endAngle={-270}
            innerRadius="78%"
            outerRadius="100%"
            barSize={8}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar dataKey="value" background={{ fill: "var(--muted)" }} cornerRadius={999} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="mb-0.5 size-3.5 text-muted-foreground" style={{ color }} />
          <span className="text-lg leading-none font-semibold tabular-nums">{value.toLocaleString()}</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {pctOfQueued}% of queued{pctOfPrev !== null && <span> · {pctOfPrev}% of prior</span>}
        </p>
      </div>
    </div>
  );
}

/** Queued -> delivered -> opened -> clicked, each a ring meter (share of queued), plus bounce/complaint status. */
export function CampaignAnalytics({ counts }: { counts: Record<string, number> }) {
  const queued = counts.queued ?? 0;
  const bounced = counts.bounced ?? 0;
  const complained = counts.complained ?? 0;
  const bounceRate = queued > 0 ? Math.round((bounced / queued) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-y-6 sm:grid-cols-4">
        {STAGES.map((s, i) => {
          const value = counts[s.key] ?? 0;
          const prev = i > 0 ? (counts[STAGES[i - 1].key] ?? 0) : null;
          return (
            <Ring
              key={s.key}
              label={s.label}
              Icon={s.icon}
              value={value}
              pctOfQueued={queued > 0 ? Math.round((value / queued) * 100) : 0}
              pctOfPrev={prev !== null && prev > 0 ? Math.round((value / prev) * 100) : null}
              color={`color-mix(in oklab, var(--color-chart-1) ${s.mix}, transparent)`}
            />
          );
        })}
      </div>
      {(bounced > 0 || complained > 0) && (
        <div className="flex flex-wrap gap-4 border-t pt-4 text-sm">
          {bounced > 0 && (
            <span className="flex items-center gap-1.5 text-destructive">
              <MailWarningIcon className="size-4" />
              {bounced} bounced <span className="text-muted-foreground">({bounceRate}%)</span>
            </span>
          )}
          {complained > 0 && (
            <span className="flex items-center gap-1.5 text-destructive">
              <MailWarningIcon className="size-4" />
              {complained} complained
            </span>
          )}
        </div>
      )}
    </div>
  );
}
