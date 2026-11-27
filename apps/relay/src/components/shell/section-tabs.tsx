import { Link } from "@tanstack/react-router";
import type { SectionTab } from "./nav";
import { usePageOf } from "./page-data";
import { navSearch } from "./scope";
import { untyped } from "../lib/route-search";

export function SectionTabs({ tabs, active, appId, label = "Sections" }: { tabs: SectionTab[]; active: string; appId?: string; label?: string }) {
  const pageOf = usePageOf();
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to as string}
          search={untyped(navSearch(tab.to, tab.search, appId, pageOf))}
          aria-current={tab.id === active ? "page" : undefined}
          data-active={tab.id === active}
          className="inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
