import { notFound } from "next/navigation";
import { MailboxIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { outboxStatusLabel } from "@/components/ds/plain-labels";
import { readMailboxLetter } from "@/lib/mailbox/list";
import { MailboxLetterBody } from "../mailbox-letter";

export const dynamic = "force-dynamic";

function fromLine(fromEmail: string, fromName: string | null): string {
  if (!fromEmail) return "No From set";
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail;
}

export default async function MailboxLetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await readMailboxLetter(id);
  if (!row) notFound();
  const status = row.status ?? "sent";

  return (
    <PageShell>
      <PageHeader
        icon={MailboxIcon}
        title={row.subject}
        subtitle={`${fromLine(row.fromEmail, row.fromName)} → ${row.toEmail}`}
        actions={<Badge variant={status === "failed" ? "destructive" : "secondary"}>{outboxStatusLabel(status)}</Badge>}
      />
      <SectionCard
        title={row.tenantName ?? "Relay"}
        subtitle={new Date(row.createdAt).toLocaleString()}
      >
        <MailboxLetterBody html={row.html} text={row.text} />
      </SectionCard>
    </PageShell>
  );
}
