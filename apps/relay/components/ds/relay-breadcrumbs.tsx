"use client";

import { Breadcrumbs } from "@foundry/design-system";

const LABELS: Record<string, string> = {
  dashboard: "Relay",
  logs: "Outbox",
  templates: "Templates",
  campaigns: "Campaigns",
  channels: "Channels",
  tenants: "Tenants",
  domains: "Domains",
  sending: "SMTP",
  accounts: "Operators",
  account: "Account",
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  "in-app": "In-app",
};

export function RelayBreadcrumbs() {
  return (
    <Breadcrumbs
      resolveLabel={(seg) => LABELS[seg] ?? seg.replace(/-/g, " ")}
    />
  );
}
