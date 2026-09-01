import { desc } from "drizzle-orm";
import { ScrollTextIcon } from "lucide-react";
import { EmptyState, PageHeader, PageShell } from "@foundry/design-system";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@foundry/ui/table";
import { OutboxStatusBadge } from "@/components/outbox-status-badge";
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
      {rows.length === 0 ? (
        <EmptyState icon={ScrollTextIcon} message="No messages in the outbox yet." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.publicId}>
                <TableCell>
                  <OutboxStatusBadge status={r.status} />
                </TableCell>
                <TableCell className="font-mono text-xs">{r.channel}</TableCell>
                <TableCell>{r.kind}</TableCell>
                <TableCell>{r.event ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.recipientEmail ?? r.recipientPhone ?? r.recipientExternalId ?? "—"}
                </TableCell>
                <TableCell className="nums">{r.attempts}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">{r.lastError ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PageShell>
  );
}
