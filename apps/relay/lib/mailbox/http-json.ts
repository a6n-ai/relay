import { listMailboxLetters, readMailboxLetter } from "./list";

type LetterRow = Awaited<ReturnType<typeof listMailboxLetters>>[number];
type LetterDetail = NonNullable<Awaited<ReturnType<typeof readMailboxLetter>>>;

export function mailboxLetterJson(row: LetterRow) {
  return {
    publicId: row.publicId,
    subject: row.subject,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    toEmail: row.toEmail,
    createdAt: row.createdAt,
    tenantPublicId: row.tenantPublicId,
    tenantName: row.tenantName,
    status: row.status,
    direction: row.direction,
    origin: row.origin,
    threadId: row.threadId,
    rfcMessageId: row.rfcMessageId,
    inReplyTo: row.inReplyTo,
    rfcReferences: row.rfcReferences,
  };
}

export function mailboxLetterDetailJson(row: LetterDetail) {
  return {
    ...mailboxLetterJson(row),
    html: row.html,
    text: row.text,
  };
}
