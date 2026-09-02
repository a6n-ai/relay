import { MailboxIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";
import { FilteredResourceList } from "@/components/ds/listing-controls";
import type { ListingFilter } from "@/components/ds/listing-controls";
import { listMailboxLetters } from "@/lib/mailbox/list";
import { toMailboxListingRow } from "@/lib/mailbox/listing";

export const dynamic = "force-dynamic";

const MAILBOX_FILTERS: ListingFilter[] = [
  { id: "out", label: "Relay sent" },
  { id: "automatic", label: "Automatic" },
  { id: "campaign", label: "Campaigns" },
  { id: "failed", label: "Failed" },
];

export default async function MailboxPage() {
  const rows = await listMailboxLetters();
  const items = rows.map(toMailboxListingRow);

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
