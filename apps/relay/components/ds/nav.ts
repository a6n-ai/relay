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
import type { IconColor } from "./icon-color";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Icon colour, Linear-style. */
  color: IconColor;
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
    { href: "/dashboard/settings/mailboxes", label: "Mailboxes" },
    { href: "/dashboard/settings/tags", label: "Tags" },
    { href: "/dashboard/account", label: "Your account" },
  ],
  /** Organization sidebar section (Clients + Team). Clients tab is platform-only in the shell. */
  organization: [
    { href: "/dashboard/platform", label: "Clients" },
    { href: "/dashboard/accounts", label: "Team" },
  ],
} as const;

const tabHrefs = (tabs: readonly { href: string }[]) => tabs.map((t) => t.href);

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Home", icon: HouseIcon, color: "purple" },
      { href: "/dashboard/mailbox", label: "Inbox", icon: InboxIcon, color: "blue" },
    ],
  },
  {
    label: "Reach people",
    items: [
      { href: "/dashboard/campaigns", label: "Campaigns", icon: MegaphoneIcon, color: "orange", also: tabHrefs(SECTION_TABS.campaigns) },
      { href: "/dashboard/lists", label: "People", icon: UsersIcon, color: "green" },
    ],
  },
  {
    label: "Activity",
    items: [{ href: "/dashboard/logs", label: "Sends", icon: ScrollTextIcon, color: "yellow", also: tabHrefs(SECTION_TABS.activity) }],
  },
  {
    label: "Setup",
    items: [
      { href: "/dashboard/tenants", label: "Apps", icon: KeyIcon, color: "purple" },
      {
        href: SECTION_TABS.channels[0]!.href,
        label: "Channels",
        icon: RadioTowerIcon,
        color: "blue",
        also: ["/dashboard/channels"],
      },
      { href: "/dashboard/settings/email", label: "Settings", icon: SettingsIcon, color: "red", also: tabHrefs(SECTION_TABS.settings) },
    ],
  },
];

/** True when `path` is `base` or a page below it. */
export const isUnder = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** The sidebar link to highlight for a path: the longest matching route wins; Home only on itself. */
export function activeNavHref(pathname: string): string | undefined {
  let best: { href: string; len: number } | undefined;
  for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
    const bases = item.href === "/dashboard" ? [] : [item.href, ...(item.also ?? [])];
    if (item.href === "/dashboard" && pathname === "/dashboard") return item.href;
    for (const b of bases) if (isUnder(pathname, b) && (!best || b.length > best.len)) best = { href: item.href, len: b.length };
  }
  return best?.href;
}

/** The sidebar item whose page the path belongs to (the one `activeNavHref` highlights). */
export function activeNavItem(pathname: string): NavItem | undefined {
  const href = activeNavHref(pathname);
  return NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === href);
}
