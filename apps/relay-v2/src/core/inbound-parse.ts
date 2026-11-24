import PostalMime from "postal-mime";

export class InboundParseError extends Error {
  constructor(message: "Unreadable letter" | "Missing From" | "Missing Message-ID" | "Empty body") {
    super(message);
    this.name = "InboundParseError";
  }
}

export type ParsedInbound = {
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  subject: string;
  html: string;
  text: string;
  rfcMessageId: string;
  inReplyTo: string | null;
  references: string | null;
  sentAt: number | null;
  attachments: { filename: string | null; mimeType: string; contentId: string | null; content: ArrayBuffer }[];
};

const EMAIL_IN = /<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/;

function parseMailboxAddress(raw: string): { email: string; name: string | null } | null {
  const trimmed = raw.trim().replace(/\n/g, " ");
  if (!trimmed) return null;
  const angle = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angle) {
    const emailMatch = angle[2].match(EMAIL_IN);
    if (!emailMatch) return null;
    const name = angle[1].replace(/^"|"$/g, "").trim();
    return { email: emailMatch[1].toLowerCase(), name: name || null };
  }
  const emailMatch = trimmed.match(EMAIL_IN);
  if (!emailMatch) return null;
  return { email: emailMatch[1].toLowerCase(), name: null };
}

export async function parseInboundEml(raw: ArrayBuffer): Promise<ParsedInbound> {
  let mail: Awaited<ReturnType<typeof PostalMime.parse>>;
  try {
    mail = await PostalMime.parse(raw);
  } catch {
    throw new InboundParseError("Unreadable letter");
  }
  const from = mail.from?.address ? parseMailboxAddress(mail.from.address) : null;
  if (!from) throw new InboundParseError("Missing From");
  const to = mail.to?.find((a) => a.address)?.address;
  const rfcMessageId = (mail.messageId ?? "").trim().replace(/^<(.*)>$/, "$1").trim();
  if (!rfcMessageId) throw new InboundParseError("Missing Message-ID");
  const html = mail.html ?? "";
  const text = mail.text ?? "";
  if (!html.trim() && !text.trim()) throw new InboundParseError("Empty body");
  const sentMs = mail.date ? Date.parse(mail.date) : Number.NaN;
  return {
    fromEmail: from.email,
    fromName: mail.from?.name?.trim() || null,
    toEmail: to ? (parseMailboxAddress(to)?.email ?? null) : null,
    subject: mail.subject ?? "",
    html,
    text,
    rfcMessageId,
    inReplyTo: mail.inReplyTo ?? null,
    references: mail.references ?? null,
    sentAt: Number.isFinite(sentMs) ? sentMs : null,
    attachments: mail.attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      contentId: a.contentId ?? null,
      content: a.content as ArrayBuffer,
    })),
  };
}

/** Keeps the last extension of up to 10 characters (dot included); the stem is cut so the result is at most 100. */
export function safeFilename(name: string | null): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/["'\u0000-\u001f\u007f-\u009f]/g, "").trim();
  const dot = clean.lastIndexOf(".");
  const hasExt = dot > 0 && clean.length - dot <= 10;
  const ext = hasExt ? clean.slice(dot) : "";
  const stem = hasExt ? clean.slice(0, dot) : clean;
  return `${stem.slice(0, 100 - ext.length)}${ext}` || "file";
}
