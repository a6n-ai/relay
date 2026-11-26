import { Hint } from "./text";

// Facets built from the loaded rows narrow this page only, so say so while older pages exist.
export function PageLocalHint({ active, hasMore }: { active: boolean; hasMore: boolean }) {
  return active && hasMore ? <Hint>Filtered on this page only. Use Show older to see more.</Hint> : null;
}
