export function MeterBar({ percent }: { percent: number }) {
  return (
    <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}
