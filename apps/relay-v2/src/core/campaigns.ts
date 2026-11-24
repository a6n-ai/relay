import { getDomain } from "tldts";
import { hasMergeToken } from "./merge";

export type CampaignProblem =
  | "from_missing"
  | "subject_missing"
  | "html_missing"
  | "text_missing"
  | "audience_empty"
  | "unsubscribe_missing"
  | "postal_address_missing";

// Purchase-sourced contacts count as consented for this long (CASL implied consent).
export const IMPLIED_CONSENT_MS = 730 * 86_400_000;

// Opt-outs are per brand: news.brand.com and shop.brand.co.uk key to their registrable domain.
export function brandDomain(email: string): string {
  const host = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return getDomain(host, { allowPrivateDomains: false }) ?? host;
}

export function campaignProblems(
  c: { fromEmail: string | null; subject: string; html: string; text: string; listIds: string[] },
  postalAddress: string | null,
): CampaignProblem[] {
  const problems: CampaignProblem[] = [];
  if (!c.fromEmail) problems.push("from_missing");
  if (!c.subject.trim()) problems.push("subject_missing");
  if (!c.html.trim()) problems.push("html_missing");
  if (!c.text.trim()) problems.push("text_missing");
  if (c.listIds.length === 0) problems.push("audience_empty");
  const bodies = [c.html, c.text];
  if (bodies.some((b) => !hasMergeToken(b, "unsubscribe_url"))) problems.push("unsubscribe_missing");
  if (!postalAddress?.trim() || bodies.some((b) => !hasMergeToken(b, "postal_address"))) problems.push("postal_address_missing");
  return problems;
}
