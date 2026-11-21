import { eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import PostalMime from "postal-mime";
import { mailboxInsertValues } from "./mailbox";
import { mailboxIdFor } from "./mailbox-ref";
import { normalizeMessageId, parseMessageIdList, sesLocalParts, threadIdForInbound } from "./mailbox-thread";
import type { TenantNotificationTables } from "./tenant-schema";

/** Raw inbound payload cap (UTF-8 bytes). Over this → 413. */
export const MAX_MAILBOX_INBOUND_BYTES = 256 * 1024;

export type MailboxInboundErrorCode = "too_large" | "invalid" | "unknown_mailbox";

export class MailboxInboundError extends Error {
  readonly code: MailboxInboundErrorCode;
  readonly status: number;

  constructor(code: MailboxInboundErrorCode, message: string) {
    super(message);
    this.name = "MailboxInboundError";
    this.code = code;
    this.status = code === "too_large" ? 413 : code === "unknown_mailbox" ? 404 : 400;
  }
}

export type ParsedAttachment = {
  filename: string | null;
  mimeType: string;
  contentId: string | null;
  content: ArrayBuffer;
};

export type ParsedInboundLetter = {
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
  rfcMessageId: string;
  inReplyTo: string | null;
  rfcReferences: string | null;
  sentAt?: number | null;
  attachments?: ParsedAttachment[];
};

export type StoredAttachment = {
  publicId: string;
  position: number;
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
  storageKey: string;
};

export type IngestInboundOpts = {
  recipientTenantId: bigint | null;
  rawKey?: string;
  authResults?: string | null;
  receivedAt?: number;
  attachments?: StoredAttachment[];
};

export type IngestInboundResult =
  | { status: "inserted"; id: bigint; publicId: string }
  | { status: "duplicate"; existingRawKey: string | null };

const EMAIL_IN = /<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/;

export function assertInboundSize(raw: string): void {
  if (Buffer.byteLength(raw, "utf8") > MAX_MAILBOX_INBOUND_BYTES) {
    throw new MailboxInboundError("too_large", "Letter is larger than 256 KB");
  }
}

export function parseMailboxAddress(raw: string): { email: string; name: string | null } | null {
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

function decodeRfc2047(value: string): string {
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_all, _cs, enc: string, data: string) => {
    try {
      if (enc.toUpperCase() === "B") {
        return Buffer.from(data, "base64").toString("utf8");
      }
      const qp = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
      return qp;
    } catch {
      return data;
    }
  });
}

function requireAddress(raw: string | undefined, field: string): { email: string; name: string | null } {
  const parsed = raw ? parseMailboxAddress(raw) : null;
  if (!parsed) throw new MailboxInboundError("invalid", `Missing ${field}`);
  return parsed;
}

function bodiesOrThrow(html: string, text: string): { html: string; text: string } {
  if (!html.trim() && !text.trim()) {
    throw new MailboxInboundError("invalid", "Empty body");
  }
  return { html, text };
}

export function parseMailboxInboundJson(raw: string): ParsedInboundLetter {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new MailboxInboundError("invalid", "Invalid JSON");
  }
  if (!data || typeof data !== "object") throw new MailboxInboundError("invalid", "Invalid JSON");
  const o = data as Record<string, unknown>;
  const fromRaw = typeof o.fromEmail === "string" ? o.fromEmail : typeof o.from === "string" ? o.from : "";
  const toRaw = typeof o.toEmail === "string" ? o.toEmail : typeof o.to === "string" ? o.to : "";
  const from = requireAddress(fromRaw, "From");
  const to = requireAddress(toRaw, "To");
  const subject = typeof o.subject === "string" ? decodeRfc2047(o.subject) : "";
  const html = typeof o.html === "string" ? o.html : "";
  const text = typeof o.text === "string" ? o.text : "";
  const rfcRaw = typeof o.rfcMessageId === "string" ? o.rfcMessageId : typeof o.messageId === "string" ? o.messageId : "";
  if (!rfcRaw.trim()) throw new MailboxInboundError("invalid", "Missing Message-ID");
  const fromName = typeof o.fromName === "string" ? o.fromName : from.name;
  const { html: h, text: t } = bodiesOrThrow(html, text);
  return {
    fromEmail: from.email,
    fromName: fromName,
    toEmail: to.email,
    subject,
    html: h,
    text: t,
    rfcMessageId: rfcRaw,
    inReplyTo: typeof o.inReplyTo === "string" ? o.inReplyTo : null,
    rfcReferences: typeof o.references === "string" ? o.references : null,
  };
}

export async function parseMailboxEml(raw: string | ArrayBuffer | Uint8Array): Promise<ParsedInboundLetter> {
  let mail: Awaited<ReturnType<typeof PostalMime.parse>>;
  try {
    mail = await PostalMime.parse(raw);
  } catch {
    throw new MailboxInboundError("invalid", "Unreadable letter");
  }
  const fromRaw = mail.from?.address;
  const toRaw = mail.to?.find((a) => a.address)?.address;
  const from = requireAddress(fromRaw, "From");
  const to = requireAddress(toRaw, "To");
  const rfcRaw = mail.messageId ?? "";
  if (!rfcRaw.trim()) throw new MailboxInboundError("invalid", "Missing Message-ID");
  const { html, text } = bodiesOrThrow(mail.html ?? "", mail.text ?? "");
  const sentMs = mail.date ? Date.parse(mail.date) : Number.NaN;
  return {
    fromEmail: from.email,
    fromName: mail.from?.name?.trim() || null,
    toEmail: to.email,
    subject: mail.subject ?? "",
    html,
    text,
    rfcMessageId: rfcRaw,
    inReplyTo: mail.inReplyTo ?? null,
    rfcReferences: mail.references ?? null,
    sentAt: Number.isFinite(sentMs) ? sentMs : null,
    attachments: mail.attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      contentId: a.contentId ?? null,
      content: a.content as ArrayBuffer,
    })),
  };
}

/** JSON object or RFC 822. Does not execute HTML. */
export async function parseMailboxInbound(raw: string): Promise<ParsedInboundLetter> {
  assertInboundSize(raw);
  const trimmed = raw.trim();
  if (!trimmed) throw new MailboxInboundError("invalid", "Empty body");
  if (trimmed.startsWith("{")) return parseMailboxInboundJson(trimmed);
  return parseMailboxEml(raw);
}

export type InboundSnsDecision =
  | { kind: "direct" }
  | { kind: "subscription" }
  | { kind: "notification"; message: string }
  | { kind: "ignore" };

/** SNS SubscribeURL is never fetched — confirmation stays in AWS. */
export function inboundSnsDecision(raw: string): InboundSnsDecision {
  try {
    const msg = JSON.parse(raw) as { Type?: string; Message?: string; SubscribeURL?: string };
    if (typeof msg?.Type !== "string") return { kind: "direct" };
    if (msg.Type === "SubscriptionConfirmation") return { kind: "subscription" };
    if (msg.Type === "Notification" && typeof msg.Message === "string") {
      return { kind: "notification", message: msg.Message };
    }
    if (typeof msg.Type === "string" && msg.Type !== "Notification") return { kind: "ignore" };
  } catch {
    return { kind: "direct" };
  }
  return { kind: "direct" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

async function findParent(db: Db, tables: TenantNotificationTables, parentIds: string[]) {
  const [byRfc] = await db
    .select({ tenantId: tables.emailMailbox.tenantId, threadId: tables.emailMailbox.threadId })
    .from(tables.emailMailbox)
    .where(inArray(tables.emailMailbox.rfcMessageId, parentIds))
    .limit(1);
  if (byRfc) return byRfc;
  // SES rewrites the Message-ID of mail we send, so replies cite the SES id.
  const sesIds = sesLocalParts(parentIds);
  if (sesIds.length === 0) return undefined;
  const [bySes] = await db
    .select({ tenantId: tables.emailMailbox.tenantId, threadId: tables.emailMailbox.threadId })
    .from(tables.emailMailbox)
    .innerJoin(tables.notificationOutbox, eq(tables.emailMailbox.outboxId, tables.notificationOutbox.id))
    .where(inArray(tables.notificationOutbox.providerMessageId, sesIds))
    .limit(1);
  return bySes;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function ingestInboundLetter(
  db: Db,
  tables: TenantNotificationTables,
  parsed: ParsedInboundLetter,
  /** When given, the letter belongs to this app, and a parent thread only counts if it is the same app's. */
  opts?: IngestInboundOpts,
): Promise<IngestInboundResult> {
  const rfcMessageId = normalizeMessageId(parsed.rfcMessageId) ?? parsed.rfcMessageId.trim();
  const inReplyTo = normalizeMessageId(parsed.inReplyTo);
  const parentIds = [
    ...new Set([
      ...parseMessageIdList(parsed.inReplyTo),
      ...parseMessageIdList(parsed.rfcReferences),
    ]),
  ];
  let tenantId: bigint | null = null;
  let threadId = rfcMessageId;
  if (parentIds.length > 0) {
    const parent = await findParent(db, tables, parentIds);
    const parentTenantId = (parent?.tenantId as bigint | null | undefined) ?? null;
    // A forged References header must not drop a letter into another app's conversation.
    if (parent && (opts === undefined || parentTenantId === opts.recipientTenantId)) {
      tenantId = parentTenantId;
      threadId =
        typeof parent.threadId === "string" && parent.threadId
          ? parent.threadId
          : threadIdForInbound({
              inReplyTo: parsed.inReplyTo,
              references: parsed.rfcReferences,
              fallback: rfcMessageId,
              subject: parsed.subject,
            });
    }
  }
  if (opts !== undefined) tenantId = opts.recipientTenantId;
  const values = mailboxInsertValues({
    outboxId: null,
    tenantId,
    fromEmail: parsed.fromEmail,
    fromName: parsed.fromName,
    toEmail: parsed.toEmail,
    subject: parsed.subject,
    html: parsed.html,
    text: parsed.text,
    direction: "in",
    origin: "automatic",
    rfcMessageId,
    inReplyTo,
    rfcReferences: parsed.rfcReferences,
    threadId,
    rawKey: opts?.rawKey,
    authResults: opts?.authResults,
    sentAt: parsed.sentAt,
    createdAt: opts?.receivedAt,
  });
  const attachments = opts?.attachments ?? [];
  const mailboxId = mailboxIdFor(tables, tenantId, parsed.toEmail);

  const insertLetter = async (d: Db | Tx): Promise<IngestInboundResult> => {
    const [row] = await d
      .insert(tables.emailMailbox)
      .values({ ...values, mailboxId })
      .onConflictDoNothing({ target: tables.emailMailbox.rfcMessageId })
      .returning({ id: tables.emailMailbox.id, publicId: tables.emailMailbox.publicId });
    if (row) {
      if (attachments.length > 0) {
        await d
          .insert(tables.emailAttachment)
          .values(attachments.map((a) => ({ ...a, mailboxId: row.id })));
      }
      return { status: "inserted", id: row.id, publicId: row.publicId };
    }
    const [existing] = await d
      .select({ rawKey: tables.emailMailbox.rawKey })
      .from(tables.emailMailbox)
      .where(eq(tables.emailMailbox.rfcMessageId, rfcMessageId))
      .limit(1);
    return { status: "duplicate", existingRawKey: existing?.rawKey ?? null };
  };

  return attachments.length > 0 ? db.transaction((tx) => insertLetter(tx)) : insertLetter(db);
}
