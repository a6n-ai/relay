import type { LucideIcon } from "lucide-react";
import {
  AppWindowIcon,
  Building2Icon,
  CircleUserIcon,
  GlobeIcon,
  Grid3x3Icon,
  InboxIcon,
  KeyIcon,
  NetworkIcon,
  SendIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  TagIcon,
  UsersIcon,
} from "lucide-react";
import { isUnder, permKey, type Perm } from "./nav";

export type SettingsLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  perm?: Perm;
  /** a6n platform staff (`super_admin`) only; not a workspace permission. */
  platform?: true;
};

export const APPS_PERM: Perm = { tenant: ["read"] };

export const SETTINGS_NAV: readonly { label: "Account" | "Workspace" | "Organization"; items: readonly SettingsLink[] }[] = [
  { label: "Account", items: [{ href: "/dashboard/settings/account", label: "Your account", icon: CircleUserIcon }] },
  {
    label: "Workspace",
    items: [
      { href: "/dashboard/settings/general", label: "General", icon: SlidersHorizontalIcon, perm: { settings: ["read"] } },
      { href: "/dashboard/settings/members", label: "Members", icon: UsersIcon, perm: { staff: ["read"] } },
      { href: "/dashboard/settings/teams", label: "Teams", icon: NetworkIcon, perm: { staff: ["read"] } },
      { href: "/dashboard/settings/roles", label: "Roles", icon: ShieldIcon, perm: { staff: ["read"] } },
      { href: "/dashboard/settings/mailboxes", label: "Mailboxes", icon: InboxIcon, perm: { settings: ["read"] } },
      { href: "/dashboard/settings/mailbox-access", label: "Mailbox access", icon: Grid3x3Icon, perm: { mailbox: ["manage"] } },
      { href: "/dashboard/settings/email", label: "Email sending", icon: SendIcon, perm: { settings: ["read"] } },
      { href: "/dashboard/settings/tags", label: "Tags", icon: TagIcon, perm: { settings: ["read"] } },
    ],
  },
  {
    label: "Organization",
    items: [{ href: "/dashboard/settings/clients", label: "Clients", icon: Building2Icon, platform: true }],
  },
];

export function appSettingsLinks(publicId: string): SettingsLink[] {
  const base = `/dashboard/settings/apps/${publicId}`;
  return [
    { href: base, label: "General", icon: SlidersHorizontalIcon },
    { href: `${base}/mailboxes`, label: "Mailboxes", icon: InboxIcon },
    { href: `${base}/domain`, label: "Domain", icon: GlobeIcon },
    { href: `${base}/keys`, label: "Access keys", icon: KeyIcon },
  ];
}

type NavLink = { href: string; label: string; icon: LucideIcon; active: boolean; open?: boolean; children?: NavLink[] };
type NavGroup = { label: string; items: NavLink[] };

/**
 * The settings sidebar for the caller: permitted links, the Apps group (open app expanded), and
 * which single link the path belongs to. `allowed` holds `permKey`s; the server gates each page too.
 */
export function visibleSettingsNav(
  allowed: ReadonlySet<string>,
  apps: readonly { publicId: string; name: string }[],
  pathname: string,
  platformStaff = false,
): NavGroup[] {
  const shows = (perm?: Perm) => !perm || allowed.has(permKey(perm));
  const groups: NavGroup[] = SETTINGS_NAV.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => shows(i.perm) && (!i.platform || platformStaff)).map((i) => ({ href: i.href, label: i.label, icon: i.icon, active: false })),
  })).filter((g) => g.items.length > 0);

  const openApp = apps.find((a) => isUnder(pathname, `/dashboard/settings/apps/${a.publicId}`));
  // An app's General page matches only itself; its sub-pages are the longer matches.
  const exactOnly = new Set(apps.map((a) => `/dashboard/settings/apps/${a.publicId}`));
  if (shows(APPS_PERM) && apps.length > 0) {
    // Apps sits above Organization, which stays the last group.
    const at = groups.findIndex((g) => g.label === "Organization");
    groups.splice(at === -1 ? groups.length : at, 0, {
      label: "Apps",
      // Every app keeps its sub-links mounted so the sidebar can animate them closed; `open` decides the height.
      items: apps.map((a) => ({
        href: `/dashboard/settings/apps/${a.publicId}`,
        label: a.name,
        icon: AppWindowIcon,
        active: false,
        open: a.publicId === openApp?.publicId,
        children: appSettingsLinks(a.publicId).map((c) => ({ ...c, active: false })),
      })),
    });
  }

  // App header rows share their href with General, so only leaf links compete for "active".
  const candidates = groups.flatMap((g) => g.items.flatMap((i) => (g.label === "Apps" ? (i.children ?? []) : [i])));
  const matches = (href: string) => pathname === href || (!exactOnly.has(href) && isUnder(pathname, href));
  const best = candidates.filter((c) => matches(c.href)).sort((a, b) => b.href.length - a.href.length)[0];
  if (best) best.active = true;
  return groups;
}
