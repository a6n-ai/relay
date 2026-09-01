import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState, PageHeader, PageShell } from "@foundry/design-system";

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
      <PageHeader icon={icon} title={title} subtitle={subtitle} />
      <EmptyState icon={icon} message={message} action={action} />
    </PageShell>
  );
}
