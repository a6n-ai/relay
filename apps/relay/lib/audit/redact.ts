export type FieldDiff = Record<string, { from: unknown; to: unknown }>;

/** Mask named fields in an audit diff so secrets never land in audit_log. */
export function redactFields(changes: FieldDiff | null, fields: readonly string[]): FieldDiff | null {
  if (!changes) return null;
  const next = { ...changes };
  for (const field of fields) {
    if (next[field]) next[field] = { from: "***", to: "***" };
  }
  return next;
}
