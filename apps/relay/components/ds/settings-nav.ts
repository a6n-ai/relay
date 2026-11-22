import { isUnder, permKey, type Perm } from "./nav";

export type SettingsLink = { href: string; label: string; perm?: Perm };

export const APPS_PERM: Perm = { tenant: ["read"] };

export const SETTINGS_NAV: readonly { label: "Account" | "Workspace"; items: readonly SettingsLink[] }[] = [
  { label: "Account", items: [{ href: "/dashboard/settings/account", label: "Your account" }] },
  {
    label: "Workspace",
    items: [
      { href: "/dashboard/settings/general", label: "General", perm: { settings: ["read"] } },
      { href: "/dashboard/settings/members", label: "Members", perm: { staff: ["read"] } },
      { href: "/dashboard/settings/teams", label: "Teams", perm: { staff: ["read"] } },
      { href: "/dashboard/settings/roles", label: "Roles", perm: { staff: ["read"] } },
      { href: "/dashboard/settings/mailboxes", label: "Mailboxes", perm: { settings: ["read"] } },
      { href: "/dashboard/settings/mailbox-access", label: "Mailbox access", perm: { mailbox: ["manage"] } },
      { href: "/dashboard/settings/email", label: "Email sending", perm: { settings: ["read"] } },
      { href: "/dashboard/settings/tags", label: "Tags", perm: { settings: ["read"] } },
    ],
  },
];

export function appSettingsLinks(publicId: string): SettingsLink[] {
  const base = `/dashboard/settings/apps/${publicId}`;
  return [
    { href: base, label: "General" },
    { href: `${base}/mailboxes`, label: "Mailboxes" },
    { href: `${base}/domain`, label: "Domain" },
    { href: `${base}/keys`, label: "Access keys" },
  ];
}

type NavLink = { href: string; label: string; active: boolean; children?: NavLink[] };
type NavGroup = { label: string; items: NavLink[] };

/**
 * The settings sidebar for the caller: permitted links, the Apps group (open app expanded), and
 * which single link the path belongs to. `allowed` holds `permKey`s; the server gates each page too.
 */
export function visibleSettingsNav(
  allowed: ReadonlySet<string>,
  apps: readonly { publicId: string; name: string }[],
  pathname: string,
): NavGroup[] {
  const shows = (perm?: Perm) => !perm || allowed.has(permKey(perm));
  const groups: NavGroup[] = SETTINGS_NAV.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => shows(i.perm)).map((i) => ({ href: i.href, label: i.label, active: false })),
  })).filter((g) => g.items.length > 0);

  const openApp = apps.find((a) => isUnder(pathname, `/dashboard/settings/apps/${a.publicId}`));
  // An app's General page matches only itself; its sub-pages are the longer matches.
  const exactOnly = new Set(apps.map((a) => `/dashboard/settings/apps/${a.publicId}`));
  if (shows(APPS_PERM) && apps.length > 0) {
    groups.push({
      label: "Apps",
      items: apps.map((a) => ({
        href: `/dashboard/settings/apps/${a.publicId}`,
        label: a.name,
        active: false,
        ...(a.publicId === openApp?.publicId
          ? { children: appSettingsLinks(a.publicId).map((c) => ({ ...c, active: false })) }
          : {}),
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
