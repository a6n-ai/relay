import { RoutedTabNav } from "@foundry/design-system";
import { SECTION_TABS } from "./nav";

/** The tab row above a grouped section's pages (Campaigns, Activity, Channels, Settings). */
export function SectionTabs({ section, label }: { section: keyof typeof SECTION_TABS; label: string }) {
  return (
    <div className="mb-6">
      <RoutedTabNav tabs={SECTION_TABS[section]} ariaLabel={label} />
    </div>
  );
}
