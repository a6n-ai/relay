import { describe, expect, it } from "vitest";
import { LANE_MIN, channelShares } from "./channel-flow";

describe("channelShares", () => {
  it("empty week: hairline lanes, no NaN", () => {
    const out = channelShares([0, 0, 0, 0]);
    expect(out.every((o) => o.pct === 0 && o.width === LANE_MIN && o.share === 0)).toBe(true);
  });
  it("one channel only takes 100%", () => {
    const out = channelShares([0, 7, 0, 0]);
    expect(out.map((o) => o.pct)).toEqual([0, 100, 0, 0]);
    expect(out[0]!.width).toBe(LANE_MIN);
    expect(out[1]!.width).toBeGreaterThan(LANE_MIN);
  });
  it("rounds to exactly 100", () => {
    const out = channelShares([1, 1, 1, 0]);
    expect(out.reduce((s, o) => s + o.pct, 0)).toBe(100);
  });
});
