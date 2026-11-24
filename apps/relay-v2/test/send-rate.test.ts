import { describe, expect, it } from "vitest";
import { DEFAULT_SES_RATE, sesSendRate } from "../src/core/send-rate";
import type { Env } from "../src/env";

const withVar = (value: string | undefined): Env =>
  ({ SES_MAX_SEND_RATE_CA_CENTRAL_1: value }) as unknown as Env;

describe("sesSendRate", () => {
  it("reads the region-named binding", () => {
    expect(sesSendRate(withVar("10"), "ca-central-1")).toBe(10);
  });

  it("falls back to the default for unset, non-numeric and non-positive values", () => {
    expect(DEFAULT_SES_RATE).toBe(14);
    for (const value of [undefined, "abc", "0", "-3", ""]) {
      expect(sesSendRate(withVar(value), "ca-central-1")).toBe(14);
    }
  });
});
