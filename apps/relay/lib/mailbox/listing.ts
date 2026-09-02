import {
  letterFilterKeys,
  type MailboxDirection,
  type MailboxOrigin,
  type MailboxOutboxStatus,
} from "@relay/engine";
import type { ListingBadge, ListingRow } from "@/components/ds/listing-controls";
import { outboxStatusLabel } from "@/components/ds/plain-labels";

export type MailboxListRecord = {
  publicId: string;
  subject: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  tenantName: string | null;
  status: MailboxOutboxStatus;
  direction: MailboxDirection;
  origin: MailboxOrigin;
  /** Must never be copied into searchText. */
  html?: string;
};

export function fromLine(fromEmail: string, fromName: string | null): string {
  if (!fromEmail) return "No From set";
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

function letterBadges(r: MailboxListRecord): ListingBadge[] {
  if (r.direction === "in") {
    return [{ label: "Received", variant: "secondary" }];
  }
  const status = r.status ?? "sent";
  return [{ label: outboxStatusLabel(status), variant: status === "failed" ? "destructive" : "outline" }];
}

export function toMailboxListingRow(r: MailboxListRecord): ListingRow {
  const from = fromLine(r.fromEmail, r.fromName);
  const app = r.tenantName ?? "Relay";
  const badge = letterBadges(r)[0]?.label ?? "";
  const meta = `To ${r.toEmail} · From ${from} · ${app}`;
  return {
    id: r.publicId,
    title: r.subject,
    meta,
    href: `/dashboard/mailbox/${r.publicId}`,
    searchText: `${r.subject} ${r.toEmail} ${from} ${app} ${badge}`,
    filterKeys: letterFilterKeys({
      direction: r.direction,
      origin: r.origin,
      outboxStatus: r.status,
    }),
    badges: letterBadges(r),
  };
}
