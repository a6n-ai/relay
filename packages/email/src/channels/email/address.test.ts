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

describe("formatAddress quoting and injection", () => {
  it("quotes a name with specials and escapes quote and backslash", () => {
    expect(formatAddress({ email: "a@b.com", name: 'Doe, "J" \\ Co' })).toBe('"Doe, \\"J\\" \\\\ Co" <a@b.com>');
    expect(formatAddress({ email: "a@b.com", name: "Acme <x@y.z>" })).toBe('"Acme <x@y.z>" <a@b.com>');
  });

  it("rejects CR/LF and control characters", () => {
    expect(() => formatAddress({ email: "a@b.com", name: "Ada\r\nBcc: evil@x.com" })).toThrow(/control/);
    expect(() => formatAddress({ email: "a@b.com", name: "Ada\u0000" })).toThrow(/control/);
    expect(() => formatAddress({ email: "a@b.com\nBcc: x@y.z" })).toThrow(/control/);
  });
});
