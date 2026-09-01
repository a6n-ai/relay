import { describe, expect, it } from "vitest";
import {
  IMPLIED_CONSENT_MS,
  complianceProfile,
  mailingCountryFromIso,
  marketingConsentBlockReason,
  tenantCanSendMarketing,
} from "./compliance";

const DAY = 86_400_000;

describe("mailingCountryFromIso", () => {
  it("maps UK to GB and EU members to EU", () => {
    expect(mailingCountryFromIso("uk")).toBe("GB");
    expect(mailingCountryFromIso("DE")).toBe("EU");
    expect(mailingCountryFromIso("ca")).toBe("CA");
    expect(mailingCountryFromIso("")).toBe("OTHER");
  });
});

describe("complianceProfile", () => {
  it("uses opt-out for the US and opt-in elsewhere by default", () => {
    expect(complianceProfile("US").marketingRequiresExpressOptIn).toBe(false);
    expect(complianceProfile("CA").impliedConsentTtlMs).toBe(IMPLIED_CONSENT_MS);
    expect(complianceProfile("FR").marketingRequiresExpressOptIn).toBe(true);
    expect(complianceProfile("XX").marketingRequiresExpressOptIn).toBe(true);
  });
});

describe("marketingConsentBlockReason", () => {
  const now = 1_000 * DAY;

  it("defaults to Canadian CASL: purchase inside 24 months is allowed", () => {
    expect(
      marketingConsentBlockReason({
        country: "CA",
        consentSource: "purchase",
        consentAt: now - IMPLIED_CONSENT_MS + DAY,
        now,
      }),
    ).toBeNull();
    expect(
      marketingConsentBlockReason({
        country: "CA",
        consentSource: "purchase",
        consentAt: now - IMPLIED_CONSENT_MS - DAY,
        now,
      }),
    ).toBe("implied_consent_expired");
  });

  it("lets US CAN-SPAM send without prior opt-in", () => {
    expect(
      marketingConsentBlockReason({
        country: "US",
        consentSource: null,
        consentAt: null,
        now,
      }),
    ).toBeNull();
  });

  it("rejects GDPR marketing without express opt-in", () => {
    expect(
      marketingConsentBlockReason({
        country: "DE",
        consentSource: "purchase",
        consentAt: now,
        now,
      }),
    ).toBe("purchase_not_express");
    expect(
      marketingConsentBlockReason({
        country: "DE",
        consentSource: "import_other",
        consentAt: now,
        now,
      }),
    ).toBe("import_not_express");
    expect(
      marketingConsentBlockReason({
        country: "DE",
        consentSource: "express_optin",
        consentAt: now,
        now,
      }),
    ).toBeNull();
  });

  it("always blocks an unsubscribe", () => {
    expect(
      marketingConsentBlockReason({
        country: "US",
        consentSource: "express_optin",
        consentAt: now,
        unsubscribedAt: now,
        now,
      }),
    ).toBe("unsubscribed");
  });
});

describe("tenantCanSendMarketing", () => {
  it("requires a physical address where the profile says so", () => {
    expect(tenantCanSendMarketing({ country: "US", physicalAddress: "" })).toBe("missing_physical_address");
    expect(tenantCanSendMarketing({ country: "US", physicalAddress: "1 King St W, Toronto" })).toBeNull();
  });
});

describe("AU / IN / missing consent", () => {
  const now = 1_000 * DAY;

  it("lets Australia send marketing without prior opt-in", () => {
    expect(complianceProfile("AU").marketingRequiresExpressOptIn).toBe(false);
    expect(marketingConsentBlockReason({ country: "AU", consentSource: null, consentAt: null, now })).toBeNull();
  });

  it("requires express opt-in in India; purchase is not enough", () => {
    expect(
      marketingConsentBlockReason({
        country: "IN",
        consentSource: "purchase",
        consentAt: now,
        now,
      }),
    ).toBe("purchase_not_express");
  });

  it("blocks CA marketing with no recorded consent", () => {
    expect(
      marketingConsentBlockReason({
        country: "CA",
        consentSource: null,
        consentAt: null,
        now,
      }),
    ).toBe("missing_consent");
  });

  it("allows a CASL import_other attestation", () => {
    expect(
      marketingConsentBlockReason({
        country: "CA",
        consentSource: "import_other",
        consentAt: now,
        now,
      }),
    ).toBeNull();
  });
});
