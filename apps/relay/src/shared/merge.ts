const MERGE_FIELDS = ["contact.email", "contact.first_name", "contact.last_name", "contact.name", "postal_address"] as const;
type MergeValues = Record<(typeof MERGE_FIELDS)[number], string>;
export const MERGE_SAMPLES: MergeValues = {
  "contact.email": "priya@example.com",
  "contact.first_name": "Priya",
  "contact.last_name": "Sharma",
  "contact.name": "Priya Sharma",
  postal_address: "100 Sample Street, Toronto ON",
};
export type MergeData = { email: string; firstName: string | null; lastName: string | null; data?: Record<string, string> };

const TOKEN_RE = /\{\{\s*([a-z0-9_.]+)\s*\}\}/g;
const DATA_KEY = /^data\.[a-z0-9_]+$/;
const UNSUBSCRIBE = "unsubscribe_url";
const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function unknownMergeFields(template: string, opts?: { data?: boolean }): string[] {
  const unknown = new Set<string>();
  for (const [, name] of template.matchAll(TOKEN_RE)) {
    if (name === UNSUBSCRIBE || (MERGE_FIELDS as readonly string[]).includes(name!)) continue;
    if (opts?.data && DATA_KEY.test(name!)) continue;
    unknown.add(name!);
  }
  return [...unknown];
}

export function hasMergeToken(template: string, name: string): boolean {
  return new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`).test(template);
}

// One pass over the template, so a value that contains a token is never expanded.
export function renderMerge(template: string, values: Record<string, string>, mode: "html" | "text" | "subject"): string {
  return template.replace(TOKEN_RE, (token, name: string) => {
    if (name === UNSUBSCRIBE) return token;
    if (!Object.hasOwn(values, name)) return DATA_KEY.test(name) ? "" : token;
    const value = values[name]!;
    if (mode === "html") return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
    if (mode === "subject") return value.replace(/[\r\n]/g, "");
    return value;
  });
}

export function fillUnsubscribe(s: string, url: string): string {
  return s.replace(/\{\{\s*unsubscribe_url\s*\}\}/g, () => url);
}

export function contactValues(m: MergeData, postalAddress: string): Record<string, string> {
  const data = Object.fromEntries(Object.entries(m.data ?? {}).map(([k, v]) => [`data.${k}`, v]));
  return {
    ...data,
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
    return { email: v.email, firstName: v.firstName ?? null, lastName: v.lastName ?? null, data: v.data };
  } catch {
    return null;
  }
}
