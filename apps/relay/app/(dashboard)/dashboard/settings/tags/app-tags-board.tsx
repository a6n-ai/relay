"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TagsIcon, XIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { apiFetch } from "@relay/engine/ui/api-fetch";
import { EmptyState } from "@/components/ds/empty-state";
import { ListingTable, type ListingFilter, type ListingRow } from "@/components/ds/listing-table";

export function AppTagsBoard({
  items,
  filters,
  emptyAction,
}: {
  items: Array<ListingRow & { tenantPublicId: string; slug: string }>;
  filters: ListingFilter[];
  emptyAction?: ReactNode;
}) {
  const router = useRouter();

  async function remove(tenantPublicId: string, slug: string) {
    try {
      await apiFetch("/api/notifications/tags", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantPublicId, slug }),
      });
      router.refresh();
    } catch {
      /* toasted */
    }
  }

  const rows: ListingRow[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    meta: item.meta,
    searchText: item.searchText,
    filterKeys: item.filterKeys,
    badges: item.badges,
    trailing: (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${item.title}`}
        onClick={() => void remove(item.tenantPublicId, item.slug)}
      >
        <XIcon />
      </Button>
    ),
  }));

  return (
    <ListingTable
      title="All tags"
      framed
      searchPlaceholder="Search tags"
      filters={filters}
      items={rows}
      empty={
        <EmptyState
          icon={TagsIcon}
          title="No tags yet"
          lines={["A tag marks every message for one app.", "Add one to find those messages fast in Inbox."]}
          action={emptyAction}
          docsHref="/docs"
        />
      }
    />
  );
}
