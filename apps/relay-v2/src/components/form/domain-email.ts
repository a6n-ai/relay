export function normaliseLocal(s: string): string {
  const t = s.trim().toLowerCase();
  const at = t.indexOf("@");
  return at === -1 ? t : t.slice(0, at);
}

// A pasted full address only splits when its domain is one the workspace owns.
export function splitEmail(input: string, domains: string[]): { local: string; domain?: string } {
  const t = input.trim().toLowerCase();
  const at = t.indexOf("@");
  const local = normaliseLocal(t);
  if (at === -1) return { local };
  const domain = t.slice(at + 1);
  return domains.includes(domain) ? { local, domain } : { local };
}

// Only verified domains can receive mail, so inboxes ("inbox" or "both") exclude pending ones.
export function addressDomains(
  domains: { domain: string; status: string }[],
  kind: "sender" | "inbox" | "both",
): { domain: string; pending: boolean; disabled: boolean }[] {
  return domains.map((d) => {
    const pending = d.status !== "verified";
    return { domain: d.domain, pending, disabled: pending && kind !== "sender" };
  });
}

export function defaultDomain(rows: { domain: string; disabled: boolean }[]): string {
  return rows.find((r) => !r.disabled)?.domain ?? "";
}
