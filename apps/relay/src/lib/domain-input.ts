// Pasted URLs and emails become a bare hostname: scheme, user@, path, port and www. are dropped.
export function normaliseDomainInput(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.split(/[/?#]/)[0] ?? "";
  s = s.slice(s.lastIndexOf("@") + 1).replace(/:\d+$/, "").replace(/^www\./, "");
  return s.replace(/\.+$/, "");
}

export const looksLikeDomain = (s: string): boolean => /^[^\s/:@?#\\.]+(\.[^\s/:@?#\\.]+)+$/.test(s);
