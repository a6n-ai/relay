"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import {
  DataTable,
  FilterChips,
  FilterPill,
  SearchInput,
  type Column,
} from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { StatusGlyph, type GlyphKind } from "./status-glyph";

export type ListingFilter = { id: string; label: string };

export type ListingBadge = {
  label: string;
  variant: "outline" | "secondary" | "destructive";
};

/**
 * Soft collection row mapped onto Foundry/Realm `DataTable`.
 * Prefer `DataTable` directly for sortable columns, URL facets, or server paging
 * (Beautiful UI Records Table). Keep this helper for chip-filtered operator lists
 * (Beautiful UI Filter Table).
 */
export type ListingRow = {
  id: string;
  title: string;
  meta?: string;
  href?: string;
  searchText: string;
  filterKeys: string[];
  badges?: ListingBadge[];
  shortId?: string;
  glyph?: GlyphKind;
  glyphLabel?: string;
  /** Kept for callers; status chips replace group strips on DataTable. */
  group?: string;
  groupGlyph?: GlyphKind;
  trailingText?: string;
  avatar?: string;
  trailing?: ReactNode;
};

const ALL: ListingFilter = { id: "all", label: "All" };

type ListingColumn = "title" | "meta" | "trailing";

const COLUMNS: readonly Column<ListingColumn>[] = [
  { key: "title", label: "Name" },
  { key: "meta", label: "Detail" },
  { key: "trailing", label: "", width: "w-44" },
];

export function listingCountLabel(visible: number, total: number): string {
  if (visible === total) return total.toLocaleString("en");
  return `${visible.toLocaleString("en")} of ${total.toLocaleString("en")}`;
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

/** Chip + search toolbar on Foundry FilterBar primitives (for custom boards). */
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
  const showChips = filters.length > 1;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-56 flex-1">
        <SearchInput
          value={query}
          onChange={onQuery}
          placeholder={searchPlaceholder}
          shortPlaceholder="Search…"
        />
      </div>
      {showChips ? (
        <FilterChips>
          {filters.map((f) => (
            <FilterPill
              key={f.id}
              label={f.label}
              count={counts[f.id] ?? 0}
              active={filter === f.id}
              onClick={() => onFilter(f.id)}
            />
          ))}
        </FilterChips>
      ) : null}
    </div>
  );
}

function TitleCell({ item }: { item: ListingRow }) {
  const title = item.href ? (
    <Link
      href={item.href}
      prefetch={false}
      className="min-w-0 truncate font-medium outline-none hover:underline focus-visible:underline"
    >
      {item.title}
    </Link>
  ) : (
    <span className="min-w-0 truncate font-medium">{item.title}</span>
  );

  return (
    <div className="flex min-w-0 items-center gap-3">
      {item.glyph ? <StatusGlyph kind={item.glyph} label={item.glyphLabel} /> : null}
      {item.shortId ? (
        <span className="text-muted-foreground hidden w-14 shrink-0 truncate font-mono text-xs sm:block">
          {item.shortId}
        </span>
      ) : null}
      {item.avatar ? (
        <span
          aria-hidden
          className="bg-muted text-muted-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium"
        >
          {item.avatar}
        </span>
      ) : null}
      {title}
    </div>
  );
}

function TrailingCell({ item }: { item: ListingRow }) {
  return (
    <span className="flex items-center justify-end gap-2">
      {item.trailingText ? (
        <span className="text-muted-foreground hidden max-w-[10rem] truncate text-[13px] lg:inline">
          {item.trailingText}
        </span>
      ) : null}
      {item.badges?.map((b) => (
        <Badge key={`${item.id}-${b.label}`} variant={b.variant}>
          {b.label}
        </Badge>
      ))}
      {item.trailing}
    </span>
  );
}

/**
 * Operator collection list on Foundry/Realm `DataTable` (not a separate table).
 * Status chips filter in-memory rows; search uses DataTable’s URL `?q=` box.
 */
export function ListingTable({
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
  /** Optional section title chrome (settings-style). */
  framed?: boolean;
}) {
  const [filter, setFilter] = useState("all");

  const filters = useMemo(() => {
    const used = new Set(items.flatMap((item) => item.filterKeys));
    return [ALL, ...extraFilters.filter((f) => used.has(f.id))];
  }, [items, extraFilters]);

  const counts = useMemo(() => {
    const next: Record<string, number> = { all: items.length };
    for (const f of filters) {
      if (f.id === "all") continue;
      next[f.id] = items.filter((item) => item.filterKeys.includes(f.id)).length;
    }
    return next;
  }, [items, filters]);

  const rows = useMemo(
    () => items.filter((item) => filter === "all" || item.filterKeys.includes(filter)),
    [items, filter],
  );

  if (items.length === 0) return <>{empty}</>;

  const showChips = filters.length > 1;
  const table = (
    <DataTable
      serial={false}
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.id}
      search={{
        placeholder: searchPlaceholder,
        shortPlaceholder: "Search…",
        keys: ["searchText", "title", "meta"],
      }}
      filters={
        showChips ? (
          <FilterChips>
            {filters.map((f) => (
              <FilterPill
                key={f.id}
                label={f.label}
                count={counts[f.id] ?? 0}
                active={filter === f.id}
                onClick={() => setFilter(f.id)}
              />
            ))}
          </FilterChips>
        ) : undefined
      }
      emptyIcon={SearchIcon}
      emptyMessage={`No ${title.toLowerCase()} yet.`}
      emptySearchMessage="Nothing matches. Clear search or pick All."
      renderRow={(r) => (
        <>
          <TableCell>
            <TitleCell item={r} />
          </TableCell>
          <TableCell className="text-muted-foreground text-[13px]">{r.meta ?? null}</TableCell>
          <TableCell className="text-right">
            <TrailingCell item={r} />
          </TableCell>
        </>
      )}
    />
  );

  if (framed) {
    return (
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {table}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="sr-only">{title}</h2>
      {table}
    </section>
  );
}

/** @deprecated Prefer `ListingTable`. */
export const FilteredResourceList = ListingTable;
