"use client";

import { useMemo, useState, type ReactNode } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { cn } from "@foundry/ui/cn";
import { ResourceBoard, ResourceEmpty, ResourceGroup, ResourceRow } from "@/components/ds/resource-list";
import type { GlyphKind } from "./status-glyph";

export type ListingFilter = { id: string; label: string };

export type ListingBadge = {
  label: string;
  variant: "outline" | "secondary" | "destructive";
};

export type ListingRow = {
  id: string;
  title: string;
  meta?: string;
  href?: string;
  searchText: string;
  filterKeys: string[];
  badges?: ListingBadge[];
  /** Mono id shown before the title. */
  shortId?: string;
  /** Status ring shown before the id, with the words a screen reader hears. */
  glyph?: GlyphKind;
  glyphLabel?: string;
  /** Rows with a group are listed under a strip with this label, groups in the order they first appear. */
  group?: string;
  groupGlyph?: GlyphKind;
  /** Muted text at the right of the row (a failure reason, a date). */
  trailingText?: string;
};

const ALL: ListingFilter = { id: "all", label: "All" };

export function listingCountLabel(visible: number, total: number): string {
  if (visible === total) return total.toLocaleString("en");
  return `${visible.toLocaleString("en")} of ${total.toLocaleString("en")}`;
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
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("nums text-xs tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count.toLocaleString("en")}</span>
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

function groupRows(rows: ListingRow[]): { label: string; glyph?: GlyphKind; rows: ListingRow[] }[] | null {
  if (!rows.some((r) => r.group)) return null;
  const groups = new Map<string, { label: string; glyph?: GlyphKind; rows: ListingRow[] }>();
  for (const row of rows) {
    const label = row.group ?? "Other";
    const group = groups.get(label) ?? { label, glyph: row.groupGlyph, rows: [] };
    group.rows.push(row);
    groups.set(label, group);
  }
  return [...groups.values()];
}

function ListingRowView({ item }: { item: ListingRow }) {
  return (
    <ResourceRow
      href={item.href}
      title={item.title}
      meta={item.meta}
      shortId={item.shortId}
      glyph={item.glyph}
      glyphLabel={item.glyphLabel}
      trailingText={item.trailingText}
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
  );
}

/**
 * Search plus filter chips over a Linear list. `empty` (an EmptyState) shows while there is
 * nothing to narrow; `framed` puts the list in a settings card instead of edge to edge.
 */
export function FilteredResourceList({
  title,
  empty,
  searchPlaceholder,
  filters: extraFilters,
  items,
  framed,
}: {
  title: string;
  empty: ReactNode;
  searchPlaceholder: string;
  filters: ListingFilter[];
  items: ListingRow[];
  framed?: boolean;
}) {
  const { query, setQuery, filter, setFilter, filters, counts, visible } = useListingState(
    items,
    extraFilters,
  );

  if (items.length === 0) return <>{empty}</>;

  const groups = groupRows(visible);
  return (
    <ResourceBoard
      title={title}
      framed={framed}
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
        <ResourceEmpty icon={SearchIcon} message="Nothing matches. Clear search or pick All." />
      ) : groups ? (
        groups.map((g) => (
          <ResourceGroup key={g.label} label={g.label} count={g.rows.length} glyph={g.glyph}>
            {g.rows.map((item) => (
              <ListingRowView key={item.id} item={item} />
            ))}
          </ResourceGroup>
        ))
      ) : (
        visible.map((item) => <ListingRowView key={item.id} item={item} />)
      )}
    </ResourceBoard>
  );
}
