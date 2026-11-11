"use client";

import Link from "next/link";
import { Building2Icon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { EmptyState } from "@/components/ds/empty-state";
import { ListingTable, type ListingFilter, type ListingRow } from "@/components/ds/listing-table";
import { OpenWorkspaceButton } from "./open-workspace-button";

const CLIENT_FILTERS: ListingFilter[] = [{ id: "current", label: "Current" }];

export type ClientListItem = {
  id: string;
  name: string;
  slug: string;
  meta: string;
  isCurrent: boolean;
};

export function ClientsTable({
  clients,
  emptyAction,
}: {
  clients: ClientListItem[];
  emptyAction?: React.ReactNode;
}) {
  const items: ListingRow[] = clients.map((c) => ({
    id: c.id,
    title: c.name,
    meta: c.meta,
    searchText: `${c.name} ${c.slug} ${c.meta}`,
    filterKeys: c.isCurrent ? ["current"] : [],
    trailing: (
      <>
        {c.isCurrent ? <Badge variant="secondary">Current</Badge> : null}
        <Button asChild size="sm" variant="ghost">
          <Link href={`/dashboard/platform/${c.id}`} prefetch={false}>
            Manage
          </Link>
        </Button>
        <OpenWorkspaceButton organizationId={c.id} />
      </>
    ),
  }));

  return (
    <ListingTable
      title="Workspaces"
      searchPlaceholder="Search clients"
      filters={CLIENT_FILTERS}
      items={items}
      empty={
        <EmptyState
          icon={Building2Icon}
          title="No clients yet"
          lines={["Add a client to give a team its own workspace.", "Seed creates a6n for local ops."]}
          action={emptyAction}
        />
      }
    />
  );
}
