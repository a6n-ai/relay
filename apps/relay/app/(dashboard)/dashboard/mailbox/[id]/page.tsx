import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { PageShell, SectionCard } from "@foundry/design-system";
import { outboxStatusLabel } from "@/components/ds/plain-labels";
import { listMailboxThread, readMailboxLetter } from "@/lib/mailbox/list";
import { fromLine } from "@/lib/mailbox/listing";
import { loadComposeFroms } from "@/lib/mailbox/load-compose-froms";
import { appMessageTagsService } from "@/lib/services/mailbox-tags.service";
import { MailboxConversationChannels } from "../mailbox-conversation-channels";
import { MailboxConversationTags } from "../mailbox-conversation-tags";
import { MailboxChat, type ChatLetter } from "../mailbox-chat";
import { MailboxQuickActions } from "../mailbox-actions";
import { ViewHeader } from "@/components/ds/view-header";

export const dynamic = "force-dynamic";

const ORIGIN_LABELS: Record<string, string> = {
  manual: "Written here",
  automatic: "Automatic",
  campaign: "Campaign",
  test: "Test",
};

function normalizeSubject(subject: string) {
  return subject.replace(/^(\s*(re|fwd):\s*)+/i, "").trim().toLowerCase();
}

function DetailRow({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs break-all" : "text-sm break-all"}>{children}</dd>
    </div>
  );
}

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
  const first = letters[0] ?? row;
  const latest = letters[letters.length - 1] ?? row;
  const replyTo = latest.direction === "in" ? latest.fromEmail : latest.toEmail;
  const replySubject = latest.subject.toLowerCase().startsWith("re:")
    ? latest.subject
    : `Re: ${latest.subject}`;
  const forwardSubject = /^fwd:/i.test(row.subject) ? row.subject : `Fwd: ${row.subject}`;
  const tags = appTags.map((t) => ({ slug: t.slug, label: t.label }));

  const titleKey = normalizeSubject(row.subject);
  const chatLetters: ChatLetter[] = letters.map((letter) => ({
    publicId: letter.publicId,
    inbound: letter.direction === "in",
    from: fromLine(letter.fromEmail, letter.fromName),
    initial: (letter.fromName?.trim() || letter.fromEmail).charAt(0).toUpperCase(),
    time: new Date(letter.createdAt).toLocaleString(),
    subject: normalizeSubject(letter.subject) !== titleKey ? letter.subject : null,
    html: letter.html,
    text: letter.text,
  }));

  return (
    <PageShell>
      <ViewHeader
        title={row.subject}
        tabs={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/mailbox">
              <ArrowLeftIcon />
              Inbox
            </Link>
          </Button>
        }
        actions={
          <Badge variant={inbound ? "secondary" : status === "failed" ? "destructive" : "secondary"}>
            {inbound ? "Received" : outboxStatusLabel(status)}
          </Badge>
        }
      />
      <MailboxConversationChannels
        mail={
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <SectionCard
                title="Conversation"
                subtitle={`${letters.length} ${letters.length === 1 ? "letter" : "letters"}`}
              >
                <MailboxChat
                  letters={chatLetters}
                  froms={froms}
                  replyTo={replyTo}
                  replySubject={replySubject}
                  replyToId={latest.publicId}
                />
              </SectionCard>
            </div>
            <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-72">
              <SectionCard title="Quick actions">
                <MailboxQuickActions
                  froms={froms}
                  contact={replyTo}
                  forwardSubject={forwardSubject}
                  forwardText={`\n\n---------- Forwarded letter ----------\nFrom: ${fromLine(latest.fromEmail, latest.fromName)}\nTo: ${latest.toEmail}\nSubject: ${latest.subject}\n\n${latest.text}`}
                  messageId={latest.rfcMessageId || null}
                />
              </SectionCard>
              <SectionCard title="Details">
                <dl className="flex flex-col gap-3">
                  <DetailRow label="Contact">
                    {latest.direction === "in"
                      ? fromLine(latest.fromEmail, latest.fromName)
                      : latest.toEmail}
                  </DetailRow>
                  <DetailRow label="Mailbox">
                    {latest.direction === "in" ? latest.toEmail : first.fromEmail}
                  </DetailRow>
                  <DetailRow label="App">
                    {row.tenantPublicId ? (
                      <Link
                        href={`/dashboard/tenants/${row.tenantPublicId}`}
                        className="underline underline-offset-4"
                      >
                        {row.tenantName ?? row.tenantPublicId}
                      </Link>
                    ) : (
                      "Not tied to an app"
                    )}
                  </DetailRow>
                  <DetailRow label="Type">
                    {latest.direction === "in" ? "Received" : (ORIGIN_LABELS[latest.origin] ?? latest.origin)}
                  </DetailRow>
                  <DetailRow label="Status">
                    {latest.direction === "in" ? "Received" : outboxStatusLabel(latest.status ?? "sent")}
                  </DetailRow>
                  <DetailRow label="Letters">{letters.length}</DetailRow>
                  <DetailRow label="Started">{new Date(first.createdAt).toLocaleString()}</DetailRow>
                  <DetailRow label="Last letter">{new Date(latest.createdAt).toLocaleString()}</DetailRow>
                  {latest.rfcMessageId ? (
                    <DetailRow label="Message-ID" mono>
                      {latest.rfcMessageId}
                    </DetailRow>
                  ) : null}
                  {latest.inReplyTo ? (
                    <DetailRow label="In reply to" mono>
                      {latest.inReplyTo}
                    </DetailRow>
                  ) : null}
                </dl>
              </SectionCard>
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
            </aside>
          </div>
        }
      />
    </PageShell>
  );
}
