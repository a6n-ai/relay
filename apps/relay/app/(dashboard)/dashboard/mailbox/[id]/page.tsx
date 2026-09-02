import { notFound } from "next/navigation";
import { MailboxIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { ResourceRow } from "@/components/ds/resource-list";
import { outboxStatusLabel } from "@/components/ds/plain-labels";
import { listMailboxThread, readMailboxLetter } from "@/lib/mailbox/list";
import { fromLine } from "@/lib/mailbox/listing";
import { MailboxLetterBody } from "../mailbox-letter";

export const dynamic = "force-dynamic";

export default async function MailboxLetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await readMailboxLetter(id);
  if (!row) notFound();
  const inbound = row.direction === "in";
  const status = row.status ?? "sent";
  const thread = row.threadId ? await listMailboxThread(row.threadId) : [];
  const others = thread.filter((letter) => letter.publicId !== row.publicId);

  return (
    <PageShell>
      <PageHeader
        icon={MailboxIcon}
        title={row.subject}
        subtitle={`${fromLine(row.fromEmail, row.fromName)} → ${row.toEmail}`}
        actions={
          <Badge variant={inbound ? "secondary" : status === "failed" ? "destructive" : "secondary"}>
            {inbound ? "Received" : outboxStatusLabel(status)}
          </Badge>
        }
      />
      {others.length > 0 ? (
        <SectionCard title="This conversation" subtitle="Other letters in the same exchange">
          {others.map((letter) => (
            <ResourceRow
              key={letter.publicId}
              href={`/dashboard/mailbox/${letter.publicId}`}
              title={letter.subject}
              meta={`${fromLine(letter.fromEmail, letter.fromName)} → ${letter.toEmail}`}
              trailing={
                <Badge variant="outline">{letter.direction === "in" ? "Received" : "Relay sent"}</Badge>
              }
            />
          ))}
        </SectionCard>
      ) : null}
      <SectionCard
        title={row.tenantName ?? "Relay"}
        subtitle={new Date(row.createdAt).toLocaleString()}
      >
        <MailboxLetterBody html={row.html} text={row.text} />
      </SectionCard>
    </PageShell>
  );
}
