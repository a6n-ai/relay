// Stored templates depend on this exact missing-variable and stringification behaviour; `{{a.b|fallback}}` is additive.
// A fallback never holds a brace, so a scan stops at the next one: linear on any input (no ReDoS).
export const VARIABLE_RE = /\{\{\s*([\w.]+)\s*(?:\|([^{}]*))?\}\}/g;

export function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(VARIABLE_RE, (_m, path: string, fallback: string | undefined) => {
    const value = path.split(".").reduce<unknown>(
      (acc, key) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      vars,
    );
    if (fallback !== undefined && (value == null || String(value).trim() === "")) return fallback.trim();
    return value == null ? "" : String(value);
  });
}
