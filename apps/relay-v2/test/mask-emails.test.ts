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

  it("masks IP-literal and IDN domains and keeps a surrogate pair whole", () => {
    expect(maskEmails("bob@[1.2.3.4]")).toBe("b***@[1.2.3.4]");
    expect(maskEmails("bob@\u00e4.com")).toBe("b***@\u00e4.com");
    expect(maskEmails("\u{1F600}x@example.com")).toBe("\u{1F600}***@example.com");
  });

  it("leaves text without an address alone", () => {
    expect(maskEmails("SES timeout")).toBe("SES timeout");
  });
});
