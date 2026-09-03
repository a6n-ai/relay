import {
  mailboxThreadingFromProviderId,
  type MailboxLetterInput,
} from "@relay/engine";

/** Plain typed letter → stored HTML. No editor, no scripts. */
export function letterHtmlFromPlain(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped.split(/\n{2,}/).map((p) => p.replace(/\n/g, "<br/>"));
  return paragraphs.map((p) => `<p>${p}</p>`).join("");
}

export function manualMailboxLetter(input: {
  tenantId: bigint | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  text: string;
  providerMessageId?: string | null;
  inReplyTo?: string | null;
  rfcReferences?: string | null;
  threadId?: string | null;
}): MailboxLetterInput {
  const threading = input.providerMessageId
    ? mailboxThreadingFromProviderId(input.providerMessageId)
    : {};
  return {
    outboxId: null,
    tenantId: input.tenantId,
    fromEmail: input.fromEmail,
    fromName: input.fromName,
    toEmail: input.toEmail,
    subject: input.subject,
    html: letterHtmlFromPlain(input.text),
    text: input.text,
    direction: "out",
    origin: "manual",
    ...threading,
    ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}),
    ...(input.rfcReferences ? { rfcReferences: input.rfcReferences } : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
  };
}
