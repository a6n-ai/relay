import { stripManaged } from "@foundry/database";

export function diffChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> | null {
  const keys = Object.keys(stripManaged(patch));
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    const from = before?.[k];
    const to = after[k];
    if (from !== to) diff[k] = { from, to };
  }
  return Object.keys(diff).length ? diff : null;
}

export function coerceBigints(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(coerceBigints);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = coerceBigints(val);
    return out;
  }
  return v;
}

export function jsonSafe(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (value == null) return value;
  return coerceBigints(value) as Record<string, unknown>;
}
