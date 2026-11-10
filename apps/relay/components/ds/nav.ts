import type { LucideIcon } from "lucide-react";
import {
  HouseIcon,
  InboxIcon,
  KeyIcon,
  MegaphoneIcon,
  RadioTowerIcon,
  ScrollTextIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { RELAY_CHANNELS } from "./channels";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other routes that belong to this link (its tab pages). */
  also?: readonly string[];
};

export type NavGroup = { label?: string; items: readonly NavItem[] };

/** Tab rows shown above a section's pages; the first tab is the sidebar link's own page. */
export const SECTION_TABS = {
  campaigns: [
    { href: "/dashboard/campaigns", label: "Campaigns" },
    { href: "/dashboard/templates", label: "Templates" },
    { href: "/dashboard/automations", label: "Automations" },
  ],
  activity: [
    { href: "/dashboard/logs", label: "Sends" },
    { href: "/dashboard/webhooks", label: "Status updates" },
  ],
  channels: RELAY_CHANNELS.map((c) => ({ href: c.href, label: c.label })),
  settings: [
    { href: "/dashboard/settings/email", label: "Email sending" },
    { href: "/dashboard/settings/tags", label: "Tags" },
    { href: "/dashboard/accounts", label: "Team" },
  ],
} as const;

const tabHrefs = (tabs: readonly { href: string }[]) => tabs.map((t) => t.href);

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Home", icon: HouseIcon },
      { href: "/dashboard/mailbox", label: "Inbox", icon: InboxIcon },
    ],
  },
  {
    label: "Reach people",
    items: [
      { href: "/dashboard/campaigns", label: "Campaigns", icon: MegaphoneIcon, also: tabHrefs(SECTION_TABS.campaigns) },
      { href: "/dashboard/lists", label: "People", icon: UsersIcon },
    ],
  },
  {
    label: "Activity",
    items: [{ href: "/dashboard/logs", label: "Sends", icon: ScrollTextIcon, also: tabHrefs(SECTION_TABS.activity) }],
  },
  {
    label: "Setup",
    items: [
      { href: "/dashboard/tenants", label: "Apps", icon: KeyIcon },
      {
        href: SECTION_TABS.channels[0]!.href,
        label: "Channels",
        icon: RadioTowerIcon,
        also: ["/dashboard/channels"],
      },
      { href: "/dashboard/settings/email", label: "Settings", icon: SettingsIcon, also: tabHrefs(SECTION_TABS.settings) },
    ],
  },
];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** The sidebar link to highlight for a path: the longest matching route wins; Home only on itself. */
export function activeNavHref(pathname: string): string | undefined {
  let best: { href: string; len: number } | undefined;
  for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
    const bases = item.href === "/dashboard" ? [] : [item.href, ...(item.also ?? [])];
    if (item.href === "/dashboard" && pathname === "/dashboard") return item.href;
    for (const b of bases) if (under(pathname, b) && (!best || b.length > best.len)) best = { href: item.href, len: b.length };
  }
  return best?.href;
}
