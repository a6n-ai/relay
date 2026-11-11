"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@foundry/ui/cn";
import { SECTION_TABS } from "./nav";
import type { SectionKey } from "./section-labels";

/** Linear view tabs: compact pills that are links (aria-current marks the page), not a Radix tablist. */
export function SectionTabs({
  section,
  label,
  include,
}: {
  section: SectionKey;
  label: string;
  /** When set, only these tab hrefs render (e.g. hide Clients for non–platform admins). */
  include?: readonly string[];
}) {
  const pathname = usePathname();
  const all = SECTION_TABS[section];
  const tabs = include ? all.filter((t) => include.includes(t.href)) : all;
  const active = [...tabs]
    .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          prefetch={false}
          aria-current={t.href === active ? "page" : undefined}
          className={cn(
            "inline-flex h-7 items-center rounded-md px-2.5 text-[13px] font-medium transition-colors",
            t.href === active
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
