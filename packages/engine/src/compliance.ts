/**
 * Country-based marketing rules. Default is the strictest common set
 * (express opt-in + unsubscribe + physical address) so a missing country
 * cannot silently mail under CAN-SPAM-only rules.
 *
 * CASL implied consent from a purchase still uses IMPLIED_CONSENT_MS (730 days).
 */

/** 24 months, counted as 730 days — same window as CASL commentary in campaign-schema. */
export const IMPLIED_CONSENT_MS = 730 * 86_400_000;

export type MailingCountry = "US" | "CA" | "GB" | "EU" | "AU" | "IN" | "OTHER";

const EU_ISO = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

export function mailingCountryFromIso(iso: string | null | undefined): MailingCountry {
  const c = (iso ?? "").trim().toUpperCase();
  if (c === "UK") return "GB";
  if (c === "US" || c === "CA" || c === "GB" || c === "AU" || c === "IN") return c;
  if (EU_ISO.has(c) || c === "EU") return "EU";
  return "OTHER";
}

export interface ComplianceProfile {
  country: MailingCountry;
  /** GDPR/CASL-style: marketing needs recorded opt-in. CAN-SPAM is opt-out. */
  marketingRequiresExpressOptIn: boolean;
  /** When set, `purchase` consent expires after this many ms (CASL). */
  impliedConsentTtlMs: number | null;
  requiresPhysicalPostalAddress: boolean;
  requiresOneClickUnsubscribe: boolean;
}

export function complianceProfile(country: string | null | undefined): ComplianceProfile {
  const c = mailingCountryFromIso(country);
  switch (c) {
    case "US":
      return {
        country: c,
        marketingRequiresExpressOptIn: false,
        impliedConsentTtlMs: null,
        requiresPhysicalPostalAddress: true,
        requiresOneClickUnsubscribe: true,
      };
    case "CA":
      return {
        country: c,
        marketingRequiresExpressOptIn: true,
        impliedConsentTtlMs: IMPLIED_CONSENT_MS,
        requiresPhysicalPostalAddress: true,
        requiresOneClickUnsubscribe: true,
      };
    case "AU":
      return {
        country: c,
        marketingRequiresExpressOptIn: false,
        impliedConsentTtlMs: null,
        requiresPhysicalPostalAddress: true,
        requiresOneClickUnsubscribe: true,
      };
    case "IN":
      return {
        country: c,
        marketingRequiresExpressOptIn: true,
        impliedConsentTtlMs: null,
        requiresPhysicalPostalAddress: true,
        requiresOneClickUnsubscribe: true,
      };
    default:
      return {
        country: c,
        marketingRequiresExpressOptIn: true,
        impliedConsentTtlMs: null,
        requiresPhysicalPostalAddress: true,
        requiresOneClickUnsubscribe: true,
      };
  }
}

export interface MarketingConsentInput {
  country?: string | null;
  consentSource: string | null;
  consentAt: number | null;
  unsubscribedAt?: number | null;
  now?: number;
}

/**
 * Why this address must not receive marketing, or null if the send is allowed.
 * Transactional mail does not go through this check.
 */
export function marketingConsentBlockReason(input: MarketingConsentInput): string | null {
  if (input.unsubscribedAt) return "unsubscribed";
  const profile = complianceProfile(input.country);
  const now = input.now ?? Date.now();
  const source = input.consentSource;
  const at = input.consentAt;

  if (!profile.marketingRequiresExpressOptIn) {
    return null;
  }

  if (!source || at == null) return "missing_consent";

  if (source === "express_optin" || source === "event_signup") return null;

  if (source === "purchase") {
    if (profile.impliedConsentTtlMs == null) return "purchase_not_express";
    if (now - at > profile.impliedConsentTtlMs) return "implied_consent_expired";
    return null;
  }

  // CA (implied-consent window exists) still accepts an operator-attested import.
  // GDPR-style profiles do not treat import_other as opt-in.
  if (source === "import_other") {
    return profile.impliedConsentTtlMs != null ? null : "import_not_express";
  }

  return "missing_consent";
}

export function tenantCanSendMarketing(input: {
  country?: string | null;
  physicalAddress?: string | null;
}): string | null {
  const profile = complianceProfile(input.country);
  if (profile.requiresPhysicalPostalAddress && !(input.physicalAddress ?? "").trim()) {
    return "missing_physical_address";
  }
  return null;
}
