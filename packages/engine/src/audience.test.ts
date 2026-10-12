import { describe, expect, it } from "vitest";
import { IMPLIED_CONSENT_MS } from "./compliance";
import { classifyAudience, dedupeRecipients, isConsentValid } from "./audience";

const DAY = 86_400_000;

describe("isConsentValid", () => {
  it("treats express consent as not expiring", () => {
    expect(isConsentValid("express_optin", 0, 100 * 365 * DAY)).toBe(true);
  });

  it("accepts implied consent inside 24 months", () => {
    const now = 1_000 * DAY;
    expect(isConsentValid("purchase", now - IMPLIED_CONSENT_MS + DAY, now)).toBe(true);
  });

  it("rejects implied consent past 24 months", () => {
    const now = 1_000 * DAY;
    expect(isConsentValid("purchase", now - IMPLIED_CONSENT_MS - DAY, now)).toBe(false);
  });

  it("uses a 24-month window", () => {
    expect(IMPLIED_CONSENT_MS).toBe(730 * DAY);
  });

  it("rejects a German purchase as not express opt-in", () => {
    expect(isConsentValid("purchase", Date.now(), Date.now(), "DE")).toBe(false);
  });
});

describe("dedupeRecipients", () => {
  it("collapses the same email arriving from a segment and a list", () => {
    const out = dedupeRecipients([
      { userId: 1n, email: "a@x.com" },
      { email: "A@X.com", vars: { city: "Toronto" } },
    ]);
    expect(out).toHaveLength(1);
  });

  it("prefers the entry that carries a user id", () => {
    const out = dedupeRecipients([{ email: "a@x.com" }, { userId: 7n, email: "a@x.com" }]);
    expect(out[0].userId).toBe(7n);
  });

  it("merges merge-vars from the list entry onto the kept recipient", () => {
    const out = dedupeRecipients([
      { userId: 7n, email: "a@x.com" },
      { email: "a@x.com", vars: { city: "Toronto" } },
    ]);
    expect(out[0]).toMatchObject({ userId: 7n, vars: { city: "Toronto" } });
  });

  it("keeps distinct addresses apart", () => {
    expect(dedupeRecipients([{ email: "a@x.com" }, { email: "b@x.com" }])).toHaveLength(2);
  });

  it("drops an entry with neither an email nor a phone", () => {
    expect(dedupeRecipients([{ userId: 1n }])).toHaveLength(0);
  });
});

describe("classifyAudience", () => {
  const base = { lapsedListMembers: 0, unsubscribedListMembers: 0, suppressions: [] as { address: string; reason: string }[] };

  it("counts duplicates, invalid addresses and suppressions separately", () => {
    const out = classifyAudience({
      ...base,
      candidates: [
        { userId: 1n, email: "a@x.com" },
        { email: "A@X.com" },
        { email: "not-an-email" },
        { email: "b@x.com" },
        { email: "c@x.com" },
        { email: "d@x.com" },
      ],
      suppressions: [
        { address: "b@x.com", reason: "unsubscribe" },
        { address: "c@x.com", reason: "bounce" },
      ],
    });
    expect(out.recipients.map((r) => r.email)).toEqual(["a@x.com", "d@x.com"]);
    expect(out.breakdown).toEqual({
      eligible: 2,
      excluded: { unsubscribed: 1, suppressed: 1, noConsent: 0, invalid: 1, duplicates: 1 },
    });
  });

  it("adds list-level exclusions that never became candidates", () => {
    const out = classifyAudience({ ...base, candidates: [], lapsedListMembers: 40, unsubscribedListMembers: 3 });
    expect(out.breakdown).toEqual({
      eligible: 0,
      excluded: { unsubscribed: 3, suppressed: 0, noConsent: 40, invalid: 0, duplicates: 0 },
    });
  });

  it("keeps a phone-only recipient (sms audiences have no email)", () => {
    const out = classifyAudience({ ...base, candidates: [{ phone: "+14165550100" }] });
    expect(out.breakdown.eligible).toBe(1);
  });
});

describe("classifyAudience — review minors", () => {
  it("excludes an address whose suppression row has an empty reason", () => {
    const out = classifyAudience({
      candidates: [{ email: "a@x.com" }],
      lapsedListMembers: 0,
      unsubscribedListMembers: 0,
      suppressions: [{ address: "a@x.com", reason: "" }],
    });
    expect(out.recipients).toEqual([]);
    expect(out.breakdown.excluded.suppressed).toBe(1);
  });
});
