import { interpolate } from "../../interpolate";

// Samples land inside HTML: a placeholder like "<Order code>" would otherwise vanish as a tag.
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Preview-only variable fill: realistic, stretched (layout check) or missing (fallback check). */
export function fillSamples(html: string, samples: Record<string, string>, mode: "sample" | "long" | "missing"): string {
  if (mode === "missing") return interpolate(html, {});
  const vars: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(samples)) {
    const v = esc(mode === "long" ? `${value} ${"Venkataraman-".repeat(3)}`.trim() : value);
    key.split(".").reduce<Record<string, unknown>>((acc, part, i, parts) => {
      if (i === parts.length - 1) acc[part] = v;
      else acc[part] = (acc[part] as Record<string, unknown>) ?? {};
      return acc[part] as Record<string, unknown>;
    }, vars);
  }
  return interpolate(html, vars);
}
