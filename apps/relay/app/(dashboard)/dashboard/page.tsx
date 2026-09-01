import { LayoutDashboardIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";

export default function DashboardPage() {
  return (
    <PageShell>
      <PageHeader
        icon={LayoutDashboardIcon}
        title="Overview"
        subtitle="Relay is the notification product. Tenants send with an API key. Operators manage keys, domains, SMTP, templates, and the outbox."
      />
    </PageShell>
  );
}
