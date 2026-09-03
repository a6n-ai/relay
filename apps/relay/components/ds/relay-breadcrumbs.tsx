"use client";

import { Breadcrumbs } from "@foundry/design-system";

const LABELS: Record<string, string> = {
  dashboard: "Relay",
  logs: "Sends",
  mailbox: "Mailbox",
  templates: "Templates",
  campaigns: "Campaigns",
  lists: "People",
  webhooks: "Status updates",
  automations: "Automations",
  channels: "How you reach people",
  tenants: "Apps",
  domains: "Domains",
  sending: "Email sending",
  settings: "Settings",
  accounts: "Team",
  account: "Your account",
  email: "Email",
  tags: "Tags",
  sms: "Text",
  whatsapp: "WhatsApp",
  "in-app": "In the app",
};

export function RelayBreadcrumbs() {
  return (
    <Breadcrumbs
      resolveLabel={(seg) => LABELS[seg] ?? seg.replace(/-/g, " ")}
    />
  );
}
