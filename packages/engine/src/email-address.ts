// Same rule as the old /^[^\s@]+@[^\s@]+\.[^\s@]+$/ (no whitespace, one @ with text before it, a dot inside
// the domain with text on both sides), without a backtracking regex: linear on any input.
export function isEmailAddress(value: string): boolean {
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1 || at !== value.lastIndexOf("@")) return false;
  return value.slice(at + 1).slice(1, -1).includes(".");
}
