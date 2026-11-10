import { describe, expect, it } from "vitest";
import { foldFortnightCells, isHomeEmpty } from "./overview-stats";

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

describe("isHomeEmpty", () => {
  const quiet = {
    pendingCount: 0,
    failedCount: 0,
    recent: [],
    totals: [0, 0, 0, 0, 0, 0, 0],
    priorMix: { email: 0, sms: 0, whatsapp: 0, in_app: 0 },
  };

  it("is true when every count is zero", () => {
    expect(isHomeEmpty(quiet)).toBe(true);
  });

  it("is false once anything was sent, waits, failed, or went out the week before", () => {
    expect(isHomeEmpty({ ...quiet, totals: [0, 0, 0, 0, 0, 0, 1] })).toBe(false);
    expect(isHomeEmpty({ ...quiet, pendingCount: 1 })).toBe(false);
    expect(isHomeEmpty({ ...quiet, failedCount: 2 })).toBe(false);
    expect(isHomeEmpty({ ...quiet, priorMix: { ...quiet.priorMix, sms: 3 } })).toBe(false);
  });
});
