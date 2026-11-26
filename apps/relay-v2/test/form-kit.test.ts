import { describe, expect, it } from "vitest";
import { choiceMode } from "../src/components/form/choice-mode";
import { addressDomains, defaultDomain, normaliseLocal, splitEmail } from "../src/components/form/domain-email";
import { slugify } from "../src/components/form/slugify";

describe("choiceMode", () => {
  it("picks the control by count and options", () => {
    expect(choiceMode(3)).toBe("segmented");
    expect(choiceMode(3, { describe: true })).toBe("cards");
    expect(choiceMode(5)).toBe("select");
    expect(choiceMode(13)).toBe("combobox");
    expect(choiceMode(2, { people: true })).toBe("combobox");
  });
});

describe("splitEmail", () => {
  it("splits a pasted address when the domain is known", () => {
    expect(splitEmail("Hello@Acme.com", ["acme.com"])).toEqual({ local: "hello", domain: "acme.com" });
  });
  it("keeps only the local part for an unknown domain", () => {
    expect(splitEmail("hello@other.com", ["acme.com"])).toEqual({ local: "hello" });
  });
  it("handles a bare local part", () => {
    expect(splitEmail("sales", ["acme.com"])).toEqual({ local: "sales" });
  });
  it("normaliseLocal lowercases, trims and drops from @", () => {
    expect(normaliseLocal("  Sales@x.com ")).toBe("sales");
  });
});

describe("addressDomains", () => {
  const domains = [
    { domain: "a.com", status: "verified" },
    { domain: "b.com", status: "pending" },
  ];
  it("disables pending domains for inboxes", () => {
    expect(addressDomains(domains, "inbox")).toEqual([
      { domain: "a.com", pending: false, disabled: false },
      { domain: "b.com", pending: true, disabled: true },
    ]);
    expect(addressDomains(domains, "both")[1]?.disabled).toBe(true);
  });
  it("allows pending domains for senders", () => {
    expect(addressDomains(domains, "sender")[1]).toEqual({ domain: "b.com", pending: true, disabled: false });
  });
});

describe("defaultDomain", () => {
  it("picks the first enabled domain, or none", () => {
    expect(defaultDomain([{ domain: "b.com", disabled: true }, { domain: "a.com", disabled: false }])).toBe("a.com");
    expect(defaultDomain([{ domain: "b.com", disabled: true }])).toBe("");
  });
});

describe("slugify", () => {
  const re = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
  it("slugs names", () => {
    expect(slugify("Acme Mail!")).toBe("acme-mail");
    expect(slugify("  --x--  ")).toBe("x");
  });
  it("returns empty for no usable characters", () => {
    expect(slugify("!!!")).toBe("");
  });
  it("caps at 40 with no trailing dash", () => {
    const s = slugify("word ".repeat(12));
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
    expect(s).toMatch(re);
  });
});
