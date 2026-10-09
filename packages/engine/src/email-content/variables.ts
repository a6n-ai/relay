// Same grammar as interpolate.ts, including `{{key|fallback}}`.
const VAR_RE = /\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g;

export const CAMPAIGN_VARIABLES = ["contact.name", "contact.first_name", "contact.last_name", "contact.email"] as const;

export const CAMPAIGN_VARIABLE_SAMPLES: Record<string, string> = {
  "contact.name": "Priya Sharma",
  "contact.first_name": "Priya",
  "contact.last_name": "Sharma",
  "contact.email": "priya@example.com",
};

export function variableTokens(text: string): { key: string; from: number; to: number }[] {
  return [...text.matchAll(VAR_RE)].map((m) => ({ key: m[1]!, from: m.index!, to: m.index! + m[0].length }));
}

export function findUnknownVariables(text: string, known: readonly string[]): string[] {
  const ok = new Set(known);
  const out: string[] = [];
  for (const { key } of variableTokens(text)) if (!ok.has(key) && !out.includes(key)) out.push(key);
  return out;
}
