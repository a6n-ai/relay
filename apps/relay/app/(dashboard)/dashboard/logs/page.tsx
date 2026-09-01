import { desc } from "drizzle-orm";
import { ScrollTextIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const rows = await db
    .select()
    .from(notificationTables.notificationOutbox)
    .orderBy(desc(notificationTables.notificationOutbox.createdAt))
    .limit(100);
  return (
    <PageShell>
      <PageHeader
        icon={ScrollTextIcon}
        title="Outbox"
        subtitle="Retries use exponential backoff (1m → 1h, six attempts) on notification_outbox."
      />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="py-2">Status</th>
            <th>Channel</th>
            <th>Kind</th>
            <th>Event</th>
            <th>To</th>
            <th>Attempts</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.publicId} className="border-t">
              <td className="py-2">{r.status}</td>
              <td>{r.channel}</td>
              <td>{r.kind}</td>
              <td>{r.event ?? "—"}</td>
              <td>{r.recipientEmail ?? r.recipientPhone ?? r.recipientExternalId ?? "—"}</td>
              <td>{r.attempts}</td>
              <td className="max-w-xs truncate">{r.lastError ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  );
}
