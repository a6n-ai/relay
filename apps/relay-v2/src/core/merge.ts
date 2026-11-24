export const MERGE_FIELDS = ["contact.email", "contact.first_name", "contact.last_name", "contact.name", "postal_address"] as const;
export type MergeValues = Record<(typeof MERGE_FIELDS)[number], string>;
export const MERGE_SAMPLES: MergeValues = {
  "contact.email": "priya@example.com",
  "contact.first_name": "Priya",
  "contact.last_name": "Sharma",
  "contact.name": "Priya Sharma",
  postal_address: "100 Sample Street, Toronto ON",
};
export type MergeData = { email: string; firstName: string | null; lastName: string | null };

const TOKEN_RE = /\{\{\s*([a-z_.]+)\s*\}\}/g;
const UNSUBSCRIBE = "unsubscribe_url";
const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function unknownMergeFields(template: string): string[] {
  const unknown = new Set<string>();
  for (const [, name] of template.matchAll(TOKEN_RE)) {
    if (name !== UNSUBSCRIBE && !(MERGE_FIELDS as readonly string[]).includes(name!)) unknown.add(name!);
  }
  return [...unknown];
}

export function hasMergeToken(template: string, name: string): boolean {
  return new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`).test(template);
}

// One pass over the template, so a value that contains a token is never expanded.
export function renderMerge(template: string, values: MergeValues, mode: "html" | "text" | "subject"): string {
  return template.replace(TOKEN_RE, (token, name: string) => {
    if (name === UNSUBSCRIBE || !(name in values)) return token;
    const value = values[name as keyof MergeValues];
    if (mode === "html") return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
    if (mode === "subject") return value.replace(/[\r\n]/g, "");
    return value;
  });
}

export function fillUnsubscribe(s: string, url: string): string {
  return s.replace(/\{\{\s*unsubscribe_url\s*\}\}/g, () => url);
}

export function contactValues(m: MergeData, postalAddress: string): MergeValues {
  return {
    "contact.email": m.email,
    "contact.first_name": m.firstName ?? "",
    "contact.last_name": m.lastName ?? "",
    "contact.name": [m.firstName, m.lastName].filter(Boolean).join(" ").trim(),
    postal_address: postalAddress,
  };
}

export function parseMergeData(json: string | null): MergeData | null {
  if (json === null) return null;
  try {
    const v = JSON.parse(json) as Partial<MergeData> | null;
    if (!v || typeof v.email !== "string") return null;
    return { email: v.email, firstName: v.firstName ?? null, lastName: v.lastName ?? null };
  } catch {
    return null;
  }
}
