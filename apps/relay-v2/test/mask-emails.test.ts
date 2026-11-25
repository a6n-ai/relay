import { describe, expect, it } from "vitest";
import { maskEmails } from "../src/core/mask-emails";

describe("maskEmails", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmails("guest@example.com")).toBe("g***@example.com");
  });

  it("masks a dotless domain", () => {
    expect(maskEmails("ops@localhost")).toBe("o***@localhost");
  });

  it("masks odd local-part characters in full", () => {
    expect(maskEmails("o'brien+tag@example.com")).toBe("o***@example.com");
    expect(maskEmails("a!b#c@example.com")).toBe("a***@example.com");
  });

  it("leaves text without an address alone", () => {
    expect(maskEmails("SES timeout")).toBe("SES timeout");
  });
});
