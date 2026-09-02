import { normalizeDomain } from "@relay/email";

export type AddSendingDomainInput = { slug: string; domain: string };

export function parseAddSendingDomainForm(
  formData: FormData,
): { error: string } | { value: AddSendingDomainInput } {
  const slug = String(formData.get("slug") ?? "").trim();
  const domain = normalizeDomain(String(formData.get("domain") ?? ""));
  if (!slug || !domain) return { error: "App and domain are required" };
  return { value: { slug, domain } };
}
