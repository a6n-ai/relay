import { describe, expect, it } from "vitest";
import { formatAddress } from "./address";

describe("formatAddress", () => {
  it("wraps a display name", () => {
    expect(formatAddress({ email: "a@b.com", name: "Ada" })).toBe("Ada <a@b.com>");
  });

  it("omits angle brackets when there is no name", () => {
    expect(formatAddress({ email: "a@b.com" })).toBe("a@b.com");
  });
});
