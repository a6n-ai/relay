import type { ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { type Tone, splitDelta, toneBadgeClass } from "./tone";

/**
 * DESIGN.md status-badge: a small tinted pill. A signed delta ("+12%", "-3%") shows an arrow and
 * the bare number, like the KPI pills in Radix's dashboard; the sign stays for screen readers.
 */
export function StatusBadge({ tone, children }: { tone: Tone | undefined; children: ReactNode }) {
  const delta = typeof children === "string" ? splitDelta(children) : null;
  return (
    <Badge className={`rounded-full ${toneBadgeClass(tone)}`}>
      {delta?.dir ? (
        <>
          {delta.dir === "up" ? <ArrowUpIcon aria-hidden className="size-3" /> : <ArrowDownIcon aria-hidden className="size-3" />}
          <span className="sr-only">{delta.dir === "up" ? "up " : "down "}</span>
          {delta.text}
        </>
      ) : (
        children
      )}
    </Badge>
  );
}
