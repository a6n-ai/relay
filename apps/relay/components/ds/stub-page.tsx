import type { LucideIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { EmptyState } from "./empty-state";
import type { SectionKey } from "./section-labels";
import { ViewHeader } from "./view-header";

export function StubPage({
  icon,
  title,
  subtitle,
  section,
  emptyTitle,
  lines,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  section?: SectionKey;
  emptyTitle: string;
  lines: readonly string[];
  cta?: { label: string; href: string };
}) {
  return (
    <PageShell>
      <ViewHeader title={title} subtitle={subtitle} section={section} />
      <EmptyState icon={icon} title={emptyTitle} lines={lines} cta={cta} docsHref="/docs" />
    </PageShell>
  );
}
