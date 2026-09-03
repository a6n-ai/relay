import { notFound } from "next/navigation";
import { MailboxIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { outboxStatusLabel } from "@/components/ds/plain-labels";
import { listMailboxThread, readMailboxLetter } from "@/lib/mailbox/list";
import { fromLine } from "@/lib/mailbox/listing";
import { loadComposeFroms } from "@/lib/mailbox/load-compose-froms";
import { appMessageTagsService } from "@/lib/services/mailbox-tags.service";
import { MailboxCompose } from "../mailbox-compose";
import { MailboxConversationChannels } from "../mailbox-conversation-channels";
import { MailboxConversationTags } from "../mailbox-conversation-tags";
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
  const threadKey = row.threadId?.trim() ? row.threadId : null;
  const [froms, thread, appTags] = await Promise.all([
    loadComposeFroms(),
    threadKey ? listMailboxThread(threadKey) : Promise.resolve([row]),
    row.tenantId != null ? appMessageTagsService.forTenant(row.tenantId) : Promise.resolve([]),
  ]);
  const letters = thread.length > 0 ? thread : [row];
  const latest = letters[letters.length - 1] ?? row;
  const replyTo = latest.direction === "in" ? latest.fromEmail : latest.toEmail;
  const replySubject = latest.subject.toLowerCase().startsWith("re:")
    ? latest.subject
    : `Re: ${latest.subject}`;
  const tags = appTags.map((t) => ({ slug: t.slug, label: t.label }));

  return (
    <PageShell>
      <PageHeader
        icon={MailboxIcon}
        title={row.subject}
        subtitle={`${fromLine(row.fromEmail, row.fromName)} → ${row.toEmail}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MailboxCompose
              froms={froms}
              defaultTo={replyTo}
              defaultSubject={replySubject}
              replyToId={latest.publicId}
              label="Reply"
            />
            <Badge variant={inbound ? "secondary" : status === "failed" ? "destructive" : "secondary"}>
              {inbound ? "Received" : outboxStatusLabel(status)}
            </Badge>
          </div>
        }
      />
      {row.tenantPublicId ? (
        <SectionCard title="Tags" subtitle={row.tenantName ?? "This app"}>
          <MailboxConversationTags tenantPublicId={row.tenantPublicId} tags={tags} />
        </SectionCard>
      ) : (
        <SectionCard title="Tags" subtitle="Tags belong to an app">
          <p className="text-muted-foreground text-sm">
            This letter isn’t tied to an app, so it has no tags. Write from an app’s From, or add tags under Tags.
          </p>
        </SectionCard>
      )}
      <MailboxConversationChannels
        mail={
          <div className="flex flex-col gap-6">
            {letters.map((letter) => (
              <SectionCard
                key={letter.publicId}
                title={letter.subject}
                subtitle={`${fromLine(letter.fromEmail, letter.fromName)} → ${letter.toEmail} · ${new Date(letter.createdAt).toLocaleString()}`}
              >
                <MailboxLetterBody html={letter.html} text={letter.text} />
              </SectionCard>
            ))}
          </div>
        }
      />
    </PageShell>
  );
}
