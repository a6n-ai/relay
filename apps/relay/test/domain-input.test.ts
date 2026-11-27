import { describe, expect, it } from "vitest";
import { looksLikeDomain, normaliseDomainInput } from "../src/components/lib/domain-input";

describe("normaliseDomainInput", () => {
  it.each([
    ["  Example.COM ", "example.com"],
    ["https://www.acme.com/pricing?x=1", "acme.com"],
    ["me@acme.com", "acme.com"],
    ["mail.acme.com.", "mail.acme.com"],
    ["http://acme.com:8080/", "acme.com"],
  ])("%s -> %s", (raw, want) => expect(normaliseDomainInput(raw)).toBe(want));
  it("checks shape", () => {
    expect(looksLikeDomain("acme.com")).toBe(true);
    expect(looksLikeDomain("acme")).toBe(false);
    expect(looksLikeDomain("a b.com")).toBe(false);
  });
});
