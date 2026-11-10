"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, TagsIcon, XIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { apiFetch } from "@relay/engine/ui/api-fetch";
import {
  listingCountLabel,
  ListingToolbar,
  useListingState,
  type ListingFilter,
  type ListingRow,
} from "@/components/ds/listing-controls";
import { EmptyState } from "@/components/ds/empty-state";
import { ResourceBoard, ResourceEmpty, ResourceRow } from "@/components/ds/resource-list";

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
  const { query, setQuery, filter, setFilter, filters: chips, counts, visible } = useListingState(
    items,
    filters,
  );

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

  if (items.length === 0) {
    return (
      <EmptyState
        icon={TagsIcon}
        title="No tags yet"
        lines={["A tag marks every message for one app.", "Add one to find those messages fast in Inbox."]}
        action={emptyAction}
        docsHref="/docs"
      />
    );
  }

  return (
    <ResourceBoard
      framed
      title="All tags"
      count={listingCountLabel(visible.length, items.length)}
      toolbar={
        <ListingToolbar
          query={query}
          onQuery={setQuery}
          searchPlaceholder="Search tags"
          filter={filter}
          onFilter={setFilter}
          filters={chips}
          counts={counts}
        />
      }
    >
      {visible.length === 0 ? (
        <ResourceEmpty icon={SearchIcon} message="Nothing matches. Clear search or pick All." />
      ) : (
        visible.map((item) => (
          <ResourceRow
            key={item.id}
            title={item.title}
            meta={item.meta}
            trailing={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${item.title}`}
                onClick={() => void remove(item.tenantPublicId, item.slug)}
              >
                <XIcon />
              </Button>
            }
          />
        ))
      )}
    </ResourceBoard>
  );
}
