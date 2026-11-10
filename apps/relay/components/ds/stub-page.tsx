import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState, PageShell } from "@foundry/design-system";
import { ViewHeader } from "./view-header";

export function StubPage({
  icon,
  title,
  subtitle,
  message,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <PageShell>
      <ViewHeader icon={icon} title={title} subtitle={subtitle} />
      <EmptyState icon={icon} message={message} action={action} />
    </PageShell>
  );
}
