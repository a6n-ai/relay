import type { SECTION_TABS } from "./nav";

export type SectionKey = keyof typeof SECTION_TABS;

/** Accessible names for each tab row. */
export const SECTION_LABELS: Record<SectionKey, string> = {
  campaigns: "Campaigns",
  activity: "Activity",
  channels: "Channels",
  settings: "Settings",
  organization: "Organization",
};
