import type { LucideIcon } from "lucide-react";
import AppWindow from "lucide-react/icons/app-window";
import Globe from "lucide-react/icons/globe";
import LayoutDashboard from "lucide-react/icons/layout-dashboard";
import List from "lucide-react/icons/list";
import Mail from "lucide-react/icons/mail";
import Megaphone from "lucide-react/icons/megaphone";
import Settings from "lucide-react/icons/settings";
import Shield from "lucide-react/icons/shield";
import type { OrgRole } from "../../console/actor";
import { allows } from "../../lib/auth/permissions";

export type NavLeaf = {
  id: string;
  label: string;
  to: string;
  search?: Record<string, string>;
  need?: Record<string, string[]>;
};
export type NavItem = NavLeaf & { icon: LucideIcon; children?: NavLeaf[] };
export type NavGroup = { id: "work" | "setup" | "platform"; items: NavItem[] };
export type CreateItem = { id: string; label: string; to: string; need: Record<string, string[]> };

export const NAV: NavGroup[] = [
  {
    id: "work",
    items: [
      { id: "overview", label: "Overview", to: "/", icon: LayoutDashboard },
      {
        id: "messages",
        label: "Messages",
        to: "/messages",
        icon: Mail,
        children: [
          { id: "sent", label: "Sent", to: "/messages", search: { dir: "out" }, need: { log: ["read"] } },
          { id: "received", label: "Received", to: "/messages", search: { dir: "in" }, need: { mailbox: ["read"] } },
          { id: "failures", label: "Failed to receive", to: "/messages/failures", need: { mailbox: ["read"] } },
          { id: "suppressions", label: "Suppressions", to: "/messages/suppressions", need: { sending: ["read"] } },
        ],
      },
      {
        id: "campaigns",
        label: "Campaigns",
        to: "/campaigns",
        icon: Megaphone,
        children: [
          { id: "campaigns", label: "Campaigns", to: "/campaigns", need: { campaign: ["read"] } },
          { id: "templates", label: "Templates", to: "/campaigns/templates", need: { template: ["read"] } },
          { id: "automations", label: "Automations", to: "/campaigns/automations", need: { campaign: ["read"] } },
        ],
      },
      { id: "lists", label: "Lists", to: "/lists", icon: List, need: { list: ["read"] } },
    ],
  },
  {
    id: "setup",
    items: [
      { id: "apps", label: "Apps", to: "/apps", icon: AppWindow },
      { id: "domains", label: "Domains", to: "/domains", icon: Globe, need: { sending: ["read"] } },
      {
        id: "settings",
        label: "Settings",
        to: "/settings",
        icon: Settings,
        children: [
          { id: "general", label: "General", to: "/settings" },
          { id: "members", label: "Members", to: "/settings/members" },
          { id: "invites", label: "Invites", to: "/settings/invites" },
          { id: "teams", label: "Teams", to: "/settings/teams" },
        ],
      },
    ],
  },
  {
    id: "platform",
    items: [{ id: "admin", label: "Admin", to: "/admin", icon: Shield }],
  },
];

export const APP_SCOPED: readonly string[] = ["/messages", "/campaigns", "/campaigns/templates", "/campaigns/automations", "/lists"];

const CREATE: CreateItem[] = [
  { id: "app", label: "App", to: "/apps", need: { tenant: ["write"] } },
  { id: "campaign", label: "Campaign", to: "/campaigns", need: { campaign: ["write"] } },
  { id: "template", label: "Template", to: "/campaigns/templates", need: { template: ["write"] } },
  { id: "automation", label: "Automation", to: "/campaigns/automations", need: { campaign: ["send"] } },
  { id: "list", label: "List", to: "/lists", need: { list: ["write"] } },
  { id: "domain", label: "Domain", to: "/domains", need: { sending: ["write"] } },
  { id: "invite", label: "Invite", to: "/settings/invites", need: { invitation: ["create"] } },
];

const permitted = (roles: OrgRole[], need?: Record<string, string[]>) => !need || allows(roles, need);

export function visibleNav(roles: OrgRole[], platformAdmin: boolean, hasWorkspace = true): NavGroup[] {
  return NAV.flatMap((group) => {
    if (group.id === "platform" ? !platformAdmin : !hasWorkspace) return [];
    const items = group.items.flatMap((item) => {
      if (!item.children) return permitted(roles, item.need) ? [item] : [];
      const children = item.children.filter((child) => permitted(roles, child.need));
      return children.length > 0 ? [{ ...item, children }] : [];
    });
    return items.length > 0 ? [{ ...group, items }] : [];
  });
}

const matchesPath = (pathname: string, to: string) =>
  to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

const matchesSearch = (want: Record<string, string> | undefined, have: Record<string, unknown>) =>
  Object.entries(want ?? {}).every(([k, v]) => have[k] === undefined || have[k] === v);

const exactSearchCount = (want: Record<string, string> | undefined, have: Record<string, unknown>) =>
  Object.entries(want ?? {}).filter(([k, v]) => have[k] === v).length;

export function activeNav(
  pathname: string,
  search: Record<string, unknown>,
): { item: string; child?: string } | null {
  const item = NAV.flatMap((g) => g.items)
    .filter((i) => matchesPath(pathname, i.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  if (!item) return null;

  const child = (item.children ?? [])
    .filter((c) => matchesPath(pathname, c.to) && matchesSearch(c.search, search))
    .sort((a, b) => b.to.length - a.to.length || exactSearchCount(b.search, search) - exactSearchCount(a.search, search))[0];
  return child ? { item: item.id, child: child.id } : { item: item.id };
}

export function createItems(roles: OrgRole[], suspended: boolean): CreateItem[] {
  if (suspended) return [];
  return CREATE.filter((c) => allows(roles, c.need));
}
