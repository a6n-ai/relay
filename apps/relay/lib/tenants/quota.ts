export function monthStartUtcMs(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function quotaExceeded(used: number, limit: number): boolean {
  if (limit <= 0) return false;
  return used >= limit;
}
