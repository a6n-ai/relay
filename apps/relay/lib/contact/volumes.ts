export const VOLUMES = [
  { value: "under_10k", label: "Under 10k" },
  { value: "10k_100k", label: "10k–100k" },
  { value: "100k_1m", label: "100k–1M" },
  { value: "over_1m", label: "Over 1M" },
] as const satisfies readonly { value: string; label: string }[];
