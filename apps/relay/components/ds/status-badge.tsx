import type { ReactNode } from "react";
import { Badge } from "@foundry/ui/badge";
import { type Tone, toneBadgeClass } from "./tone";

/** DESIGN.md status-badge: a small pill whose tint says good, bad or neutral. */
export function StatusBadge({ tone, children }: { tone: Tone | undefined; children: ReactNode }) {
  return <Badge className={`rounded-full ${toneBadgeClass(tone)}`}>{children}</Badge>;
}
