import { MailboxIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter, ListingRow } from "@/components/ds/listing-controls";
import { outboxStatusLabel } from "@/components/ds/plain-labels";
import { listMailboxLetters } from "@/lib/mailbox/list";

export const dynamic = "force-dynamic";

const MAILBOX_FILTERS: ListingFilter[] = [
  { id: "pending", label: "Waiting" },
  { id: "processing", label: "Sending" },
  { id: "sent", label: "Sent" },
  { id: "failed", label: "Failed" },
];

function fromLine(fromEmail: string, fromName: string | null): string {
  if (!fromEmail) return "No From set";
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

export default async function MailboxPage() {
  const rows = await listMailboxLetters();
  const items: ListingRow[] = rows.map((r) => {
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
      filterKeys: [status],
      badges: [{ label: outboxStatusLabel(status), variant: status === "failed" ? "destructive" : "outline" }],
    };
  });

  return (
    <PageShell>
      <PageHeader
        icon={MailboxIcon}
        title="Mailbox"
        subtitle="Letters Relay sent (or tried to send) through your mail server. Opens a preview, not a delivery log."
      />
      <FilteredResourceList
        title="Letters"
        glyph="mailbox"
        emptyMessage="Nothing in the mailbox yet. Sends and test emails show up here after Relay tries to deliver them."
        searchPlaceholder="Search subject, to, or from"
        filters={MAILBOX_FILTERS}
        items={items}
      />
    </PageShell>
  );
}
