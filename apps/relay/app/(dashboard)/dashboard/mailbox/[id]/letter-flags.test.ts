import { describe, expect, it } from "vitest";
import { remoteBlockedFlag, remoteImagesMode, sentAtLabel } from "./letter-flags";

describe("remoteImagesMode", () => {
  it("allows remote images only for the letter named in ?images=", () => {
    expect(remoteImagesMode("eml_a", "eml_a")).toBe("allow");
    expect(remoteImagesMode("eml_a", "eml_b")).toBe("block");
    expect(remoteImagesMode("eml_a", undefined)).toBe("block");
  });
});

describe("remoteBlockedFlag", () => {
  it("shows the bar only when remote loads were blocked", () => {
    expect(remoteBlockedFlag("block", 2)).toBe(true);
    expect(remoteBlockedFlag("block", 0)).toBe(false);
    expect(remoteBlockedFlag("allow", 2)).toBe(false);
  });
});

describe("sentAtLabel", () => {
  const created = Date.UTC(2026, 10, 15, 9, 0, 0);

  it("hides the sent line when sent time is within a minute of creation", () => {
    expect(sentAtLabel(null, created)).toBeNull();
    expect(sentAtLabel(created + 60_000, created)).toBeNull();
  });

  it("shows the sent line when sent time differs by over a minute", () => {
    expect(sentAtLabel(created + 60_001, created)).toBe(new Date(created + 60_001).toLocaleString());
    expect(sentAtLabel(created - 3_600_000, new Date(created))).toBe(new Date(created - 3_600_000).toLocaleString());
  });
});
