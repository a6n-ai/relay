import { describe, expect, it } from "vitest";
import { foldFortnightCells } from "./overview-stats";

describe("foldFortnightCells", () => {
  it("stacks this-week days and prior-week totals", () => {
    const out = foldFortnightCells([
      { period: "this", dayIndex: 0, channel: "email", n: 2 },
      { period: "this", dayIndex: 6, channel: "sms", n: 3 },
      { period: "prior", dayIndex: 0, channel: "email", n: 4 },
    ]);
    expect(out.byChannel.email[0]).toBe(2);
    expect(out.byChannel.sms[6]).toBe(3);
    expect(out.channelTotals.email).toBe(2);
    expect(out.channelTotals.sms).toBe(3);
    expect(out.priorMix.email).toBe(4);
    expect(out.totals[0]).toBe(2);
    expect(out.totals[6]).toBe(3);
  });
});
