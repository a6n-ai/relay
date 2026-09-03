"use client";

import { useRouter } from "next/navigation";
import { TagsIcon, XIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { apiFetch } from "@relay/engine/ui";
import {
  listingCountLabel,
  ListingToolbar,
  useListingState,
  type ListingFilter,
  type ListingRow,
} from "@/components/ds/listing-controls";
import { ResourceBoard, ResourceEmpty, ResourceRow } from "@/components/ds/resource-list";

export function AppTagsBoard({
  items,
  filters,
}: {
  items: Array<ListingRow & { tenantPublicId: string; slug: string }>;
  filters: ListingFilter[];
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
      <ResourceBoard title="Tags">
        <ResourceEmpty
          icon={TagsIcon}
          message="No tags yet. Add one on the left. It will mark every message for that app."
        />
      </ResourceBoard>
    );
  }

  return (
    <ResourceBoard
      title="Tags"
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
        <ResourceEmpty icon={TagsIcon} message="Nothing matches. Clear search or pick All." />
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
