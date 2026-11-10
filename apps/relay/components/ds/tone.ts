export type Tone = "ok" | "bad" | "neutral";

/** Badge colours for a delta's tone. Text on each 10% tint clears 4.5:1 in both themes. */
export function toneBadgeClass(tone: Tone | undefined): string {
  switch (tone) {
    case "ok":
      return "bg-primary/10 text-primary-hover";
    case "bad":
      return "bg-destructive/10 text-destructive";
    case "neutral":
    case undefined:
      return "bg-muted text-muted-foreground";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

/** "+12%" → up "12%", "-3%" / "−3%" → down "3%"; anything else has no direction. */
export function splitDelta(label: string): { dir: "up" | "down" | null; text: string } {
  const m = /^([+\-−])(.+)$/.exec(label.trim());
  if (!m) return { dir: null, text: label };
  return { dir: m[1] === "+" ? "up" : "down", text: m[2]! };
}
