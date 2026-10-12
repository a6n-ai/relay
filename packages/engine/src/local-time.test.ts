import { describe, expect, it } from "vitest";
import { zonedLocalToEpoch } from "./local-time";

describe("zonedLocalToEpoch", () => {
  it("reads a wall-clock time in the given zone (EDT, UTC-4)", () => {
    expect(zonedLocalToEpoch("2026-07-01T09:30", "America/Toronto")).toBe(Date.UTC(2026, 6, 1, 13, 30));
  });
  it("handles standard time (EST, UTC-5)", () => {
    expect(zonedLocalToEpoch("2026-12-01T09:30", "America/Toronto")).toBe(Date.UTC(2026, 11, 1, 14, 30));
  });
  it("returns null for a malformed value", () => {
    expect(zonedLocalToEpoch("tomorrow", "America/Toronto")).toBeNull();
  });
});

describe("zonedLocalToEpoch — review minors", () => {
  it("rejects out-of-range parts instead of rolling them over", () => {
    expect(zonedLocalToEpoch("2026-13-45T25:61", "America/Toronto")).toBeNull();
    expect(zonedLocalToEpoch("2026-02-30T09:00", "America/Toronto")).toBeNull();
  });
});
