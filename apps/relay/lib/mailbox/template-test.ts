import {
  mailboxThreadingFromProviderId,
  type MailboxLetterInput,
} from "@relay/engine";

/** Template preview send is not a campaign and not an app receipt. */
export function templateTestMailboxLetter(input: {
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
  providerMessageId?: string | null;
}): MailboxLetterInput {
  const threading = input.providerMessageId
    ? mailboxThreadingFromProviderId(input.providerMessageId)
    : {};
  return {
    outboxId: null,
    tenantId: null,
    fromEmail: input.fromEmail,
    fromName: input.fromName,
    toEmail: input.toEmail,
    subject: input.subject,
    html: input.html,
    text: input.text,
    direction: "out",
    origin: "test",
    ...threading,
  };
}
