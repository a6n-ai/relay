export type ChoiceModeName = "segmented" | "cards" | "select" | "combobox";

export function choiceMode(count: number, opts: { describe?: boolean; people?: boolean } = {}): ChoiceModeName {
  if (opts.people || count >= 13) return "combobox";
  if (count >= 5) return "select";
  return opts.describe ? "cards" : "segmented";
}
