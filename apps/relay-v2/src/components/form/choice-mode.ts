export type ChoiceModeName = "segmented" | "cards" | "select" | "combobox";

// shortcut: 8px per character and 26px per segment is a text-sm estimate, tune if the font changes.
export function segmentsFit(labels: string[], width = 300): boolean {
  return labels.reduce((n, l) => n + l.length * 8, 0) + labels.length * 26 <= width;
}

export function choiceMode(count: number, opts: { describe?: boolean; people?: boolean; labels?: string[] } = {}): ChoiceModeName {
  if (opts.people || count >= 13) return "combobox";
  if (count >= 5) return "select";
  if (opts.describe) return "cards";
  return opts.labels && !segmentsFit(opts.labels) ? "cards" : "segmented";
}
