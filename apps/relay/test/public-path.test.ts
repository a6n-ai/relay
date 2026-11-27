import { describe, expect, it } from "vitest";
import { isPublicWhenSignedOut } from "../src/lib/public-path";

describe("isPublicWhenSignedOut", () => {
  it("is true only for the root path", () => {
    expect(isPublicWhenSignedOut("/")).toBe(true);
  });
  it("is false for deep links, which still redirect to sign-in", () => {
    for (const p of ["/campaigns", "/apps/a1", "/admin", "//", "", "/index", "/sign-in"]) {
      expect(isPublicWhenSignedOut(p)).toBe(false);
    }
  });
});
