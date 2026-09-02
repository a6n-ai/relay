import {
  letterFilterKeys,
  type MailboxDirection,
  type MailboxOrigin,
  type MailboxOutboxStatus,
} from "@relay/engine";
import type { ListingRow } from "@/components/ds/listing-controls";
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

export function toMailboxListingRow(r: MailboxListRecord): ListingRow {
  const status = r.status ?? "sent";
  const from = fromLine(r.fromEmail, r.fromName);
  const app = r.tenantName ?? "Relay";
  const meta = `To ${r.toEmail} · From ${from} · ${app}`;
  return {
    id: r.publicId,
    title: r.subject,
    meta,
    href: `/dashboard/mailbox/${r.publicId}`,
    searchText: `${r.subject} ${r.toEmail} ${from} ${app} ${outboxStatusLabel(status)}`,
    filterKeys: letterFilterKeys({
      direction: r.direction,
      origin: r.origin,
      outboxStatus: r.status,
    }),
    badges: [{ label: outboxStatusLabel(status), variant: status === "failed" ? "destructive" : "outline" }],
  };
}
