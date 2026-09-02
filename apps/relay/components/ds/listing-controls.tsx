"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  InboxIcon,
  KeyIcon,
  MailboxIcon,
  MegaphoneIcon,
  SearchIcon,
  UsersIcon,
  WebhookIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { cn } from "@foundry/ui/cn";
import { ResourceBoard, ResourceEmpty, ResourceRow } from "@/components/ds/resource-list";

export type ListingFilter = { id: string; label: string };

export type ListingBadge = {
  label: string;
  variant: "outline" | "secondary" | "destructive";
};

export type ListingGlyph = "key" | "megaphone" | "users" | "inbox" | "webhook" | "zap" | "mailbox";

export type ListingRow = {
  id: string;
  title: string;
  meta?: string;
  href?: string;
  searchText: string;
  filterKeys: string[];
  badges?: ListingBadge[];
};

function listingGlyph(name: ListingGlyph) {
  switch (name) {
    case "key":
      return KeyIcon;
    case "megaphone":
      return MegaphoneIcon;
    case "users":
      return UsersIcon;
    case "inbox":
      return InboxIcon;
    case "webhook":
      return WebhookIcon;
    case "zap":
      return ZapIcon;
    case "mailbox":
      return MailboxIcon;
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}

const ALL: ListingFilter = { id: "all", label: "All" };

export function listingCountLabel(visible: number, total: number): string {
  if (visible === total) return String(total);
  return `${visible} of ${total}`;
}

function ListingChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 border px-2.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("nums text-xs tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}

export function ListingToolbar({
  query,
  onQuery,
  searchPlaceholder,
  filter,
  onFilter,
  filters,
  counts,
}: {
  query: string;
  onQuery: (value: string) => void;
  searchPlaceholder: string;
  filter: string;
  onFilter: (id: string) => void;
  filters: ListingFilter[];
  counts: Record<string, number>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-56 flex-1">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-full border border-input bg-background py-1 pr-8 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQuery("")}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center hover:bg-muted"
            aria-label="Clear search"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <ListingChip
            key={f.id}
            label={f.label}
            count={counts[f.id] ?? 0}
            active={filter === f.id}
            onClick={() => onFilter(f.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function useListingState<T extends { searchText: string; filterKeys: string[] }>(
  items: T[],
  extraFilters: ListingFilter[],
) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const filters = useMemo(() => {
    const used = new Set(items.flatMap((item) => item.filterKeys));
    return [ALL, ...extraFilters.filter((f) => used.has(f.id))];
  }, [items, extraFilters]);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const row = item as T & Partial<ListingRow>;
      const hay = [row.searchText, row.title, row.meta, ...(row.badges?.map((b) => b.label) ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  const counts = useMemo(() => {
    const next: Record<string, number> = { all: searched.length };
    for (const f of filters) {
      if (f.id === "all") continue;
      next[f.id] = searched.filter((item) => item.filterKeys.includes(f.id)).length;
    }
    return next;
  }, [searched, filters]);

  const visible = useMemo(
    () => searched.filter((item) => filter === "all" || item.filterKeys.includes(filter)),
    [searched, filter],
  );

  return { query, setQuery, filter, setFilter, filters, counts, visible };
}

export function FilteredResourceList({
  title,
  glyph,
  emptyMessage,
  searchPlaceholder,
  filters: extraFilters,
  items,
}: {
  title: string;
  glyph: ListingGlyph;
  emptyMessage: string;
  searchPlaceholder: string;
  filters: ListingFilter[];
  items: ListingRow[];
}) {
  const icon = listingGlyph(glyph);
  const { query, setQuery, filter, setFilter, filters, counts, visible } = useListingState(
    items,
    extraFilters,
  );

  if (items.length === 0) {
    return (
      <ResourceBoard title={title}>
        <ResourceEmpty icon={icon} message={emptyMessage} />
      </ResourceBoard>
    );
  }

  return (
    <ResourceBoard
      title={title}
      count={listingCountLabel(visible.length, items.length)}
      toolbar={
        <ListingToolbar
          query={query}
          onQuery={setQuery}
          searchPlaceholder={searchPlaceholder}
          filter={filter}
          onFilter={setFilter}
          filters={filters}
          counts={counts}
        />
      }
    >
      {visible.length === 0 ? (
        <ResourceEmpty icon={icon} message="Nothing matches. Clear search or pick All." />
      ) : (
        visible.map((item) => (
          <ResourceRow
            key={item.id}
            href={item.href}
            title={item.title}
            meta={item.meta}
            trailing={
              item.badges?.length ? (
                <>
                  {item.badges.map((b) => (
                    <Badge key={`${item.id}-${b.label}`} variant={b.variant}>
                      {b.label}
                    </Badge>
                  ))}
                </>
              ) : undefined
            }
          />
        ))
      )}
    </ResourceBoard>
  );
}

export function ListingTableFrame({
  toolbar,
  children,
}: {
  toolbar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border border-border bg-card">
      <div className="border-b border-border px-4 py-3">{toolbar}</div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
