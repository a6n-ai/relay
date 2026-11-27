import type { LucideIcon } from "lucide-react";
import AppWindow from "lucide-react/icons/app-window";
import Globe from "lucide-react/icons/globe";
import LayoutGrid from "lucide-react/icons/layout-grid";
import UserPlus from "lucide-react/icons/user-plus";
import LayoutDashboard from "lucide-react/icons/layout-dashboard";
import List from "lucide-react/icons/list";
import Mail from "lucide-react/icons/mail";
import Megaphone from "lucide-react/icons/megaphone";
import Settings from "lucide-react/icons/settings";
import Shield from "lucide-react/icons/shield";
import type { FileRouteTypes } from "../../routeTree.gen";
import { allows, type Permission } from "../../shared/permissions";
import type { PageOf } from "./page-data";
import { type OrgRole } from "../../shared/roles";
import { trimSlash } from "../lib/path";

// A nav entry's label is its route's `staticData.title`; `label` is set only where one route has several entries (Sent/Received) or the entry names the page differently (General).
type NavLeaf = {
  id: string;
  label?: string;
  to: string;
  search?: Record<string, string>;
  need?: Permission;
};

type Leaf = Omit<NavLeaf, "label"> & { label: string };
export type NavItem = Leaf & { icon: LucideIcon; children?: Leaf[] };
export type NavGroup = { id: "work" | "setup" | "platform"; items: NavItem[] };
type CreateItem = {
  id: string;
  label: string;
  find?: string;
  to: FileRouteTypes["to"];
  new?: 1;
  menu?: false;
  need: Permission;
  start?: { icon: LucideIcon; title: string; line: string; cta: string };
};

type RawItem = NavLeaf & { icon: LucideIcon; children?: NavLeaf[] };
type RawGroup = { id: NavGroup["id"]; items: RawItem[] };

const NAV: RawGroup[] = [
  {
    id: "work",
    items: [
      { id: "overview", to: "/", icon: LayoutDashboard },
      {
        id: "messages",
        to: "/messages",
        icon: Mail,
        children: [
          { id: "sent", label: "Sent", to: "/messages", search: { dir: "out" }, need: { log: ["read"] } },
          { id: "received", label: "Received", to: "/messages", search: { dir: "in" }, need: { mailbox: ["read"] } },
          { id: "failures", to: "/messages/failures", need: { mailbox: ["read"] } },
          { id: "suppressions", to: "/messages/suppressions", need: { sending: ["read"] } },
        ],
      },
      {
        id: "campaigns",
        to: "/campaigns",
        icon: Megaphone,
        children: [
          { id: "campaigns", to: "/campaigns", need: { campaign: ["read"] } },
          { id: "templates", to: "/campaigns/templates", need: { template: ["read"] } },
          { id: "automations", to: "/campaigns/automations", need: { campaign: ["read"] } },
        ],
      },
      { id: "lists", to: "/lists", icon: List, need: { list: ["read"] } },
    ],
  },
  {
    id: "setup",
    items: [
      { id: "apps", to: "/apps", icon: AppWindow },
      { id: "domains", to: "/domains", icon: Globe, need: { sending: ["write"] } },
      {
        id: "settings",
        to: "/settings",
        icon: Settings,
        children: [
          { id: "general", label: "General", to: "/settings" },
          { id: "members", to: "/settings/members" },
          { id: "invites", to: "/settings/invites" },
          { id: "teams", to: "/settings/teams" },
        ],
      },
    ],
  },
  {
    id: "platform",
    items: [{ id: "admin", to: "/admin", icon: Shield }],
  },
];

// `menu: false` keeps a create out of the Add New menu; `start` puts it on the overview's Get started card.
const CREATE: CreateItem[] = [
  {
    id: "app", label: "App", to: "/apps/new", need: { tenant: ["write"] },
    start: { icon: LayoutGrid, title: "Create an app", line: "An app groups the messages, lists and campaigns you send.", cta: "Create app" },
  },
  {
    id: "domain", label: "Domain", to: "/domains/new", need: { sending: ["write"] },
    start: { icon: Globe, title: "Add a domain", line: "Verify a domain to send from your own address.", cta: "Add domain" },
  },
  { id: "address", label: "Address", to: "/domains/addresses/new", need: { sending: ["write"] } },
  { id: "campaign", label: "Campaign", to: "/campaigns/new", need: { campaign: ["write"] } },
  { id: "list", label: "List", to: "/lists/new", need: { list: ["write"] } },
  { id: "template", label: "Template", to: "/campaigns/templates/new", need: { template: ["write"] } },
  { id: "automation", label: "Automation", to: "/campaigns/automations/new", need: { campaign: ["send"] }, menu: false },
  {
    id: "invite", label: "Invite member", find: "Invite a member", to: "/settings/invites", new: 1, need: { invitation: ["create"] },
    start: { icon: UserPlus, title: "Invite your team", line: "Give teammates access to this workspace.", cta: "Invite member" },
  },
];

const permitted = (roles: OrgRole[], need?: Permission) => !need || allows(roles, need);

export function visibleNav(roles: OrgRole[], platformAdmin: boolean, hasWorkspace: boolean, pageOf: PageOf): NavGroup[] {
  const label = (leaf: NavLeaf) => leaf.label ?? pageOf(leaf.to)?.title ?? leaf.id;
  return NAV.flatMap((group) => {
    if (group.id === "platform" ? !platformAdmin : !hasWorkspace) return [];
    const items = group.items.flatMap((item): NavItem[] => {
      const named = { ...item, label: label(item) };
      if (!item.children) return permitted(roles, item.need) ? [{ ...named, children: undefined }] : [];
      const children = item.children.filter((child) => permitted(roles, child.need)).map((c) => ({ ...c, label: label(c) }));
      return children.length > 0 ? [{ ...named, children }] : [];
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

export type SectionTab = { id: string; label: string; to: string; search?: Record<string, string> };

// Section tabs show on a section's own pages (the children of a nav item); detail pages get a back link instead.
export function sectionTabs(
  roles: OrgRole[],
  pathname: string,
  search: Record<string, unknown>,
  pageOf: PageOf,
): { title: string | null; tabs: SectionTab[]; active: string } | null {
  const path = trimSlash(pathname);
  const appTabs = /^\/apps\/([^/]+)(\/webhooks)?$/.exec(path);
  if (appTabs && appTabs[1] !== "new") {
    const base = `/apps/${appTabs[1]}`;
    return {
      title: null,
      tabs: [
        { id: "overview", label: "Overview", to: base },
        { id: "webhooks", label: "Webhooks", to: `${base}/webhooks` },
      ],
      active: appTabs[2] ? "webhooks" : "overview",
    };
  }
  const item = NAV.flatMap((g) => g.items).find((i) => i.children?.some((c) => c.to === path));
  if (!item) return null;
  const tabs = visibleNav(roles, true, true, pageOf).flatMap((g) => g.items).find((i) => i.id === item.id)?.children ?? [];
  if (tabs.length < 2) return null;
  const child = activeNav(path, search)?.child;
  const active = tabs.some((t) => t.id === child) ? (child as string) : (tabs.find((t) => t.to === path)?.id ?? tabs[0].id);
  return { title: pageOf(item.to)?.title ?? item.id, tabs, active };
}
