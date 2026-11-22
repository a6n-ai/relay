import { ScrollTextIcon } from "lucide-react";
import { PageShell } from "@foundry/design-system";
import { EmptyState } from "@/components/ds/empty-state";
import { ListingTable, type ListingFilter, type ListingRow } from "@/components/ds/listing-table";
import { displayChannel, kindLabel, outboxStatusLabel } from "@/components/ds/plain-labels";
import { outboxGlyph } from "@/components/ds/status-glyph";
import { ViewHeader } from "@/components/ds/view-header";
import { requirePagePermission } from "@/lib/auth/guards";
import { mailboxScope } from "@/lib/mailbox/scope";
import { listSends } from "@/lib/notifications/list-sends";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sends" };

const SEND_FILTERS: ListingFilter[] = [
  { id: "pending", label: "Waiting" },
  { id: "processing", label: "Sending" },
  { id: "sent", label: "Sent" },
  { id: "failed", label: "Failed" },
  { id: "email", label: "Email" },
  { id: "sms", label: "Text" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "in_app", label: "In the app" },
];

export default async function LogsPage() {
  await requirePagePermission({ log: ["read"] });
  const rows = await listSends(await mailboxScope({ onMissing: "redirect" }));

  const items: ListingRow[] = rows.map((r) => {
    const recipient = r.recipientEmail ?? r.recipientPhone ?? r.recipientExternalId ?? "";
    const lastError = r.lastError ?? "";
    const status = outboxStatusLabel(r.status);
    const meta = [displayChannel(r.channel), kindLabel(r.kind), r.event ?? ""].filter(Boolean).join(" · ");
    return {
      id: r.publicId,
      title: recipient || "No recipient",
      meta,
      shortId: r.publicId.slice(-6).toUpperCase(),
      glyph: outboxGlyph(r.status),
      glyphLabel: status,
      trailingText: lastError || undefined,
      searchText: [status, meta, recipient, lastError].join(" "),
      filterKeys: [r.status, r.channel],
    };
  });

  return (
    <PageShell>
      <ViewHeader
        title="Sends"
        subtitle="Every message Relay tried to deliver. Failed ones are retried automatically a few times."
        section="activity"
      />
      <ListingTable
        title="Recent sends"
        empty={
          <EmptyState
            icon={ScrollTextIcon}
            title="Nothing sent yet"
            lines={["Sends show up here as your apps deliver mail.", "Each one gets a status you can follow."]}
            cta={{ label: "Add an app", href: "/dashboard/tenants" }}
            docsHref="/docs"
          />
        }
        searchPlaceholder="Search recipient, event, or error"
        filters={SEND_FILTERS}
        items={items}
      />
    </PageShell>
  );
}
