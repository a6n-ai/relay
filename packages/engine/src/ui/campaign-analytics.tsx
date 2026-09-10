const STAGES = [
  { key: "queued", label: "Queued" },
  { key: "delivered", label: "Delivered" },
  { key: "opened", label: "Opened" },
  { key: "clicked", label: "Clicked" },
] as const;

/** Queued→delivered→opened→clicked funnel, each stage sized relative to queued, plus a bounce rate. */
export function CampaignAnalytics({ counts }: { counts: Record<string, number> }) {
  const queued = counts.queued ?? 0;
  const bounced = counts.bounced ?? 0;
  const complained = counts.complained ?? 0;
  const bounceRate = queued > 0 ? Math.round((bounced / queued) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {STAGES.map((s, i) => {
          const value = counts[s.key] ?? 0;
          const pct = queued > 0 ? Math.min(100, Math.round((value / queued) * 100)) : 0;
          const prev = i > 0 ? (counts[STAGES[i - 1].key] ?? 0) : null;
          const ofPrev = prev && prev > 0 ? Math.round((value / prev) * 100) : null;
          return (
            <div key={s.key} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="tabular-nums">
                  <span className="font-semibold">{value}</span>
                  {ofPrev !== null && <span className="ml-1.5 text-xs text-muted-foreground">({ofPrev}% of {STAGES[i - 1].label.toLowerCase()})</span>}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
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
