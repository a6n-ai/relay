import { describe, expect, it } from "vitest";
import { deniedChannels, parseApiKeyChannels } from "./channels";
import { monthStartUtcMs, quotaExceeded } from "./quota";

function form(channels: string[]): FormData {
  const fd = new FormData();
  for (const c of channels) fd.append("channels", c);
  return fd;
}

describe("parseApiKeyChannels", () => {
  it("defaults to email when nothing is checked", () => {
    expect(parseApiKeyChannels(form([]))).toEqual(["email"]);
  });

  it("ignores channels that are not grantable yet", () => {
    expect(parseApiKeyChannels(form(["email", "sms"]))).toEqual(["email"]);
  });
});

describe("deniedChannels", () => {
  it("lists requested channels missing from the key", () => {
    expect(deniedChannels(["email"], ["email", "sms"])).toEqual(["sms"]);
  });
});

describe("quotaExceeded", () => {
  it("treats 0 as unlimited", () => {
    expect(quotaExceeded(999, 0)).toBe(false);
  });

  it("blocks when used reaches the cap", () => {
    expect(quotaExceeded(10, 10)).toBe(true);
    expect(quotaExceeded(9, 10)).toBe(false);
  });
});

describe("monthStartUtcMs", () => {
  it("snaps to the first of the UTC month", () => {
    expect(monthStartUtcMs(Date.UTC(2026, 8, 15, 12))).toBe(Date.UTC(2026, 8, 1));
  });
});
