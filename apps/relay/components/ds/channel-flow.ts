export const LANE_MIN = 1;
export const LANE_MAX = 14;

export function channelShares(counts: readonly number[]): { share: number; pct: number; width: number }[] {
  const total = counts.reduce((s, n) => s + n, 0);
  const share = counts.map((n) => (total === 0 ? 0 : n / total));
  const pct = share.map((s) => Math.floor(s * 100));
  // largest remainder so percentages sum to exactly 100
  let left = total === 0 ? 0 : 100 - pct.reduce((s, p) => s + p, 0);
  share
    .map((s, i) => ({ i, r: s * 100 - pct[i]! }))
    .sort((a, b) => b.r - a.r)
    .forEach(({ i }) => {
      if (left > 0 && counts[i]! > 0) {
        pct[i]!++;
        left--;
      }
    });
  return share.map((s, i) => ({ share: s, pct: pct[i]!, width: Math.max(LANE_MIN, s * LANE_MAX) }));
}
