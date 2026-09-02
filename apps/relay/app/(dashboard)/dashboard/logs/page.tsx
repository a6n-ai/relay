import { desc } from "drizzle-orm";
import { ScrollTextIcon } from "lucide-react";
import { EmptyState, PageHeader, PageShell } from "@foundry/design-system";
import { FilteredSendsTable } from "@/components/ds/filtered-tables";
import type { SendListItem } from "@/components/ds/filtered-tables";
import { displayChannel, kindLabel, outboxStatusLabel } from "@/components/ds/plain-labels";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const rows = await db
    .select()
    .from(notificationTables.notificationOutbox)
    .orderBy(desc(notificationTables.notificationOutbox.createdAt))
    .limit(100);

  const items: SendListItem[] = rows.map((r) => {
    const recipient = r.recipientEmail ?? r.recipientPhone ?? r.recipientExternalId ?? "";
    const lastError = r.lastError ?? "";
    return {
      publicId: r.publicId,
      status: r.status,
      channel: r.channel,
      kind: r.kind,
      event: r.event,
      recipient,
      attempts: r.attempts,
      lastError,
      searchText: [
        outboxStatusLabel(r.status),
        displayChannel(r.channel),
        kindLabel(r.kind),
        r.event ?? "",
        recipient,
        lastError,
      ].join(" "),
      filterKeys: [r.status, r.channel],
    };
  });

  return (
    <PageShell>
      <PageHeader
        icon={ScrollTextIcon}
        title="Sends"
        subtitle="Every message Relay tried to deliver. Failed ones are retried automatically a few times."
      />
      {items.length === 0 ? (
        <EmptyState icon={ScrollTextIcon} message="Nothing sent yet. Sends show up here as apps deliver mail." />
      ) : (
        <FilteredSendsTable items={items} />
      )}
    </PageShell>
  );
}
