import { getDomain } from "tldts";
import { DAY_MS } from "../shared/limits";

// Purchase-sourced contacts count as consented for this long (CASL implied consent).
export const IMPLIED_CONSENT_MS = 730 * DAY_MS;

// Opt-outs are per brand: news.brand.com and shop.brand.co.uk key to their registrable domain.
export function brandDomain(email: string): string {
  const host = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return getDomain(host, { allowPrivateDomains: false }) ?? host;
}
