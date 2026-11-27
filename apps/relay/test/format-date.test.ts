import { describe, expect, it } from "vitest";
import { formatDate, formatWhen } from "../src/components/lib/format-date";

const now = Date.UTC(2026, 10, 25, 12, 0, 0);
const ago = (ms: number) => now - ms;

describe("formatDate", () => {
  it("renders en-CA YYYY-MM-DD HH:mm in the given zone", () => {
    expect(formatDate(Date.UTC(2026, 10, 15, 9, 5), "UTC")).toBe("2026-11-15 09:05");
  });

  it("returns a dash for invalid input", () => {
    expect(formatDate("nope")).toBe("—");
    expect(formatDate(null as unknown as string)).toBe("—");
  });
});

describe("formatWhen", () => {
  it.each([
    [30_000, "just now"],
    [5 * 60_000, "5m ago"],
    [3 * 3_600_000, "3h ago"],
    [2 * 86_400_000, "2d ago"],
  ])("%i ms ago is %s", (ms, out) => {
    expect(formatWhen(ago(ms), now, "UTC")).toBe(out);
  });

  it("uses the date past 7 days", () => {
    expect(formatWhen(ago(10 * 86_400_000), now, "UTC")).toBe("2026-11-15");
  });

  it("returns a dash for invalid input", () => {
    expect(formatWhen("nope", now, "UTC")).toBe("—");
  });

  it("gives the absolute date and time for a future time", () => {
    expect(formatWhen(now + 2 * 3_600_000, now, "UTC")).toBe("2026-11-25 14:00");
  });

  it("calls the last 30 seconds just now", () => {
    expect(formatWhen(now - 30_000, now, "UTC")).toBe("just now");
  });
});
