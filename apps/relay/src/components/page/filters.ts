export type Facet = { key: string; label: string; options: { value: string; label: string }[] };
type Chip = { key: string; label: string; valueLabel: string };

export function chipsFrom(search: Record<string, unknown>, facets: Facet[]): Chip[] {
  return facets.flatMap((f) => {
    const v = search[f.key];
    if (typeof v !== "string" || !v) return [];
    return [{ key: f.key, label: f.label, valueLabel: f.options.find((o) => o.value === v)?.label ?? v }];
  });
}

export function withoutKey(search: Record<string, unknown>, key: string): Record<string, unknown> {
  const { [key]: _k, cursor: _c, offset: _o, ...rest } = search;
  return rest;
}
