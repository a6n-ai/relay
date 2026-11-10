import { SECTION_TABS, activeNavItem, isUnder } from "./nav";

export type Crumb = { label: string; href?: string };

const ALL_TABS: readonly { href: string; label: string }[] = Object.values(SECTION_TABS).flat();

/**
 * The title-row trail for a page: section › page › item. Parents link back; the last crumb is the
 * page's own title (the page itself when it is a tab or a sidebar link, the item on a detail page).
 */
export function viewCrumbs(pathname: string, title: string): Crumb[] {
  const item = activeNavItem(pathname);
  if (!item) return [{ label: title }];
  const tab = ALL_TABS.filter((t) => isUnder(pathname, t.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const parents: Crumb[] = [{ label: item.label, href: item.href }];
  if (tab && tab.label !== item.label) parents.push({ label: tab.label, href: tab.href });
  const base = tab?.href ?? item.href;
  if (pathname === base) parents.pop();
  return [...parents, { label: title }];
}
