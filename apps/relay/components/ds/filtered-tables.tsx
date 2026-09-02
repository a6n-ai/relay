"use client";

import { ScrollTextIcon, UsersIcon } from "lucide-react";
import { EmptyState } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foundry/ui/table";
import { OutboxStatusBadge } from "@/components/outbox-status-badge";
import { displayChannel, kindLabel } from "@/components/ds/plain-labels";
import {
  ListingTableFrame,
  ListingToolbar,
  listingCountLabel,
  useListingState,
  type ListingFilter,
} from "@/components/ds/listing-controls";

export type SendListItem = {
  publicId: string;
  status: "pending" | "processing" | "sent" | "failed";
  channel: string;
  kind: string;
  event: string | null;
  recipient: string;
  attempts: number;
  lastError: string;
  searchText: string;
  filterKeys: string[];
};

export const SEND_LIST_FILTERS: ListingFilter[] = [
  { id: "pending", label: "Waiting" },
  { id: "processing", label: "Sending" },
  { id: "sent", label: "Sent" },
  { id: "failed", label: "Failed" },
  { id: "email", label: "Email" },
  { id: "sms", label: "Text" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "in_app", label: "In the app" },
];

export function FilteredSendsTable({ items }: { items: SendListItem[] }) {
  const { query, setQuery, filter, setFilter, filters, counts, visible } = useListingState(
    items,
    SEND_LIST_FILTERS,
  );

  return (
    <ListingTableFrame
      toolbar={
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">Recent sends</p>
            <span className="text-muted-foreground nums text-sm tabular-nums">
              {listingCountLabel(visible.length, items.length)}
            </span>
          </div>
          <ListingToolbar
            query={query}
            onQuery={setQuery}
            searchPlaceholder="Search recipient, event, or error"
            filter={filter}
            onFilter={setFilter}
            filters={filters}
            counts={counts}
          />
        </div>
      }
    >
      {visible.length === 0 ? (
        <EmptyState icon={ScrollTextIcon} message="Nothing matches. Clear search or pick All." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-auto px-4 py-3 text-sm font-normal">Status</TableHead>
              <TableHead className="h-auto px-4 py-3 text-sm font-normal">Via</TableHead>
              <TableHead className="h-auto px-4 py-3 text-sm font-normal">Type</TableHead>
              <TableHead className="h-auto px-4 py-3 text-sm font-normal">Why</TableHead>
              <TableHead className="h-auto px-4 py-3 text-sm font-normal">To</TableHead>
              <TableHead className="h-auto px-4 py-3 text-sm font-normal">Tries</TableHead>
              <TableHead className="h-auto px-4 py-3 text-sm font-normal">What went wrong</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.publicId}>
                <TableCell>
                  <OutboxStatusBadge status={r.status} />
                </TableCell>
                <TableCell>{displayChannel(r.channel)}</TableCell>
                <TableCell>{kindLabel(r.kind)}</TableCell>
                <TableCell>{r.event ?? ""}</TableCell>
                <TableCell className="font-mono text-xs">{r.recipient}</TableCell>
                <TableCell className="nums">{r.attempts}</TableCell>
                <TableCell className="text-muted-foreground max-w-xs truncate">{r.lastError}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ListingTableFrame>
  );
}

export type TeamListItem = {
  publicId: string;
  email: string;
  name: string;
  role: string;
  status: "active" | "inactive" | "suspended" | "deleted";
  createdLabel: string;
  isYou: boolean;
  searchText: string;
  filterKeys: string[];
};

export const TEAM_LIST_FILTERS: ListingFilter[] = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "suspended", label: "Suspended" },
  { id: "deleted", label: "Deleted" },
];

function teamStatusBadge(status: TeamListItem["status"]) {
  switch (status) {
    case "active":
      return <Badge variant="secondary">Active</Badge>;
    case "inactive":
      return <Badge variant="outline">Inactive</Badge>;
    case "suspended":
      return <Badge variant="destructive">Suspended</Badge>;
    case "deleted":
      return <Badge variant="destructive">Deleted</Badge>;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function FilteredTeamTable({ items }: { items: TeamListItem[] }) {
  const { query, setQuery, filter, setFilter, filters, counts, visible } = useListingState(
    items,
    TEAM_LIST_FILTERS,
  );

  return (
    <ListingTableFrame
      toolbar={
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium">People on this console</p>
            <span className="text-muted-foreground nums text-sm tabular-nums">
              {listingCountLabel(visible.length, items.length)}
            </span>
          </div>
          <ListingToolbar
            query={query}
            onQuery={setQuery}
            searchPlaceholder="Search email, name, or role"
            filter={filter}
            onFilter={setFilter}
            filters={filters}
            counts={counts}
          />
        </div>
      }
    >
      {visible.length === 0 ? (
        <EmptyState icon={UsersIcon} message="Nothing matches. Clear search or pick All." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-auto px-4 py-3 text-sm font-normal">Email</TableHead>
              <TableHead className="h-auto px-4 py-3 text-sm font-normal">Name</TableHead>
              <TableHead className="h-auto px-4 py-3 text-sm font-normal">Role</TableHead>
              <TableHead className="h-auto px-4 py-3 text-sm font-normal">Status</TableHead>
              <TableHead className="h-auto px-4 py-3 text-sm font-normal">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => (
              <TableRow key={r.publicId}>
                <TableCell className="px-4 py-3 font-mono text-xs">
                  {r.email}
                  {r.isYou ? (
                    <Badge className="ms-2" variant="outline">
                      You
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="px-4 py-3">{r.name}</TableCell>
                <TableCell className="px-4 py-3">{r.role}</TableCell>
                <TableCell className="px-4 py-3">{teamStatusBadge(r.status)}</TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">{r.createdLabel}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ListingTableFrame>
  );
}
