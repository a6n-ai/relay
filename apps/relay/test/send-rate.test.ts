import { describe, expect, it } from "vitest";
import { sesSendRate } from "../src/core/send-rate";
import type { Env } from "../src/env";

const withVar = (value: string | undefined): Env =>
  ({ SES_MAX_SEND_RATE_CA_CENTRAL_1: value }) as unknown as Env;

describe("sesSendRate", () => {
  it("reads the region-named binding", () => {
    expect(sesSendRate(withVar("10"), "ca-central-1")).toBe(10);
  });

  it("falls back to the default for unset, non-numeric and non-positive values", () => {
    const fallback = sesSendRate(withVar(undefined), "ca-central-1");
    expect(fallback).toBeGreaterThan(0);
    for (const value of ["abc", "0", "-3", ""]) {
      expect(sesSendRate(withVar(value), "ca-central-1")).toBe(fallback);
    }
  });
});
