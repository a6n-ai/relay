import { createItems, visibleNav } from "./nav";
import type { PageOf } from "./page-data";
import { type Shell } from "../../shared/views";
import { isSuspended } from "../../shared/limits";

export type FindEntry = {
  id: string;
  group: "Pages" | "Apps" | "Actions";
  label: string;
  to: string;
  search?: Record<string, string>;
};

export function findEntries(shell: Shell, pageOf: PageOf): FindEntry[] {
  const roles = shell.active?.roles ?? [];
  const pages = visibleNav(roles, shell.platformAdmin, shell.active !== null, pageOf).flatMap((g) =>
    g.items.flatMap((item): FindEntry[] =>
      item.children
        ? item.children.map((c) => ({
            id: `page:${item.id}:${c.id}`,
            group: "Pages",
            label: c.label === item.label ? item.label : `${item.label} › ${c.label}`,
            to: c.to,
            search: c.search,
          }))
        : [{ id: `page:${item.id}`, group: "Pages", label: item.label, to: item.to, search: item.search }],
    ),
  );
  const apps = shell.apps.map((a): FindEntry => ({ id: `app:${a.id}`, group: "Apps", label: a.name, to: `/apps/${a.id}` }));
  const actions = createItems(roles, isSuspended(shell.active?.status)).map(
    (c): FindEntry => ({ id: `new:${c.id}`, group: "Actions", label: c.find ?? `New ${c.label}`, to: c.to, search: c.new ? { new: String(c.new) } : undefined }),
  );
  return [...pages, ...apps, ...actions];
}

export function pushRecent(ids: string[], id: string, max = 5): string[] {
  return [id, ...ids.filter((i) => i !== id)].slice(0, max);
}

export function readRecent(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((i): i is string => typeof i === "string") : [];
}
