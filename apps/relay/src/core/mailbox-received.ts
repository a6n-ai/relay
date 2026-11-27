export type MailboxReceivedData = {
  to: string;
  from: string;
  html: string;
  text: string;
  subject: string;
  fromName: string | null;
  messageId: string;
  envelopeTo: string;
  receivedAt: number;
  authResults: string | null;
  envelopeFrom: string;
};

// Key order is the frozen contract; do not build this from DB rows.
export function mailboxReceivedJson(d: MailboxReceivedData): string {
  const data = {
    to: d.to,
    from: d.from,
    html: d.html,
    text: d.text,
    subject: d.subject,
    fromName: d.fromName,
    messageId: d.messageId,
    envelopeTo: d.envelopeTo,
    receivedAt: d.receivedAt,
    authResults: d.authResults,
    envelopeFrom: d.envelopeFrom,
  };
  // JSON.stringify drops undefined keys silently, which would freeze a body missing a field.
  if (Object.values(data).some((v) => v === undefined)) throw new Error("mailbox.received field missing");
  if (!Number.isSafeInteger(data.receivedAt)) throw new Error("mailbox.received receivedAt not a safe integer");
  return JSON.stringify(data);
}

export function webhookBody(id: string, type: string, createdAt: number, dataJson: string): string {
  if (!Number.isSafeInteger(createdAt)) throw new Error("createdAt must be a safe integer");
  return `{"id":${JSON.stringify(id)},"type":${JSON.stringify(type)},"createdAt":${createdAt},"data":${dataJson}}`;
}

export function webhookHeaders(type: string, signatureHex: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-relay-event": type,
    "x-relay-signature": `sha256=${signatureHex}`,
  };
}
