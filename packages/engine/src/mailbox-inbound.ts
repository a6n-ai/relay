import { inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { mailboxInsertValues } from "./mailbox";
import { normalizeMessageId, parseMessageIdList, threadIdForInbound } from "./mailbox-thread";
import type { TenantNotificationTables } from "./tenant-schema";

/** Raw inbound payload cap (UTF-8 bytes). Over this → 413. */
export const MAX_MAILBOX_INBOUND_BYTES = 256 * 1024;

export type MailboxInboundErrorCode = "too_large" | "invalid";

export class MailboxInboundError extends Error {
  readonly code: MailboxInboundErrorCode;
  readonly status: number;

  constructor(code: MailboxInboundErrorCode, message: string) {
    super(message);
    this.name = "MailboxInboundError";
    this.code = code;
    this.status = code === "too_large" ? 413 : 400;
  }
}

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
};

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

function unfoldHeaders(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, " ").replace(/\n[ \t]/g, " ");
}

function headerMap(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of unfoldHeaders(block).split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    map.set(key, val);
  }
  return map;
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

export function parseMailboxEml(raw: string): ParsedInboundLetter {
  const match = raw.match(/^([\s\S]*?)\r?\n\r?\n([\s\S]*)$/);
  const headerBlock = match ? match[1] : raw;
  const body = match ? match[2] : "";
  const headers = headerMap(headerBlock);
  const from = requireAddress(headers.get("from"), "From");
  const to = requireAddress(headers.get("to"), "To");
  const subject = decodeRfc2047(headers.get("subject") ?? "");
  const rfcRaw = headers.get("message-id") ?? "";
  if (!rfcRaw.trim()) throw new MailboxInboundError("invalid", "Missing Message-ID");
  const ct = (headers.get("content-type") ?? "text/plain").toLowerCase();
  let html = "";
  let text = "";
  if (ct.includes("text/html")) html = body;
  else text = body;
  const { html: h, text: t } = bodiesOrThrow(html, text);
  return {
    fromEmail: from.email,
    fromName: from.name,
    toEmail: to.email,
    subject,
    html: h,
    text: t,
    rfcMessageId: rfcRaw,
    inReplyTo: headers.get("in-reply-to") ?? null,
    rfcReferences: headers.get("references") ?? null,
  };
}

/** JSON object or RFC 822. Does not execute HTML. */
export function parseMailboxInbound(raw: string): ParsedInboundLetter {
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

export async function ingestInboundLetter(
  db: Db,
  tables: TenantNotificationTables,
  parsed: ParsedInboundLetter,
): Promise<"inserted" | "duplicate"> {
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
    const [parent] = await db
      .select({
        tenantId: tables.emailMailbox.tenantId,
        threadId: tables.emailMailbox.threadId,
      })
      .from(tables.emailMailbox)
      .where(inArray(tables.emailMailbox.rfcMessageId, parentIds))
      .limit(1);
    if (parent) {
      tenantId = (parent.tenantId as bigint | null) ?? null;
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
  });
  const inserted = await db
    .insert(tables.emailMailbox)
    .values(values)
    .onConflictDoNothing({ target: tables.emailMailbox.rfcMessageId })
    .returning({ publicId: tables.emailMailbox.publicId });
  return inserted.length > 0 ? "inserted" : "duplicate";
}
