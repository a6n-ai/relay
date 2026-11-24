import { and, asc, desc, eq, gt, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { safeDownloadName } from "../core/download";
import { contactValues, parseMergeData, renderMerge } from "../core/merge";
import type { Env } from "../env";
import type { Stream, SuppressionReason } from "../core/send-input";
import type { AttachmentView, MessageView } from "./client-do";
import * as schema from "./client-schema";

export type MessageAccess = { out: boolean; inbound: "all" | string[] };
export type MessageStatus = "queued" | "sent" | "failed" | "suppressed";

export type MessageSummary = {
  id: string;
  appId: string;
  direction: "in" | "out";
  status: MessageStatus;
  fromEmail: string | null;
  toEmail: string | null;
  subject: string | null;
  error: string | null;
  createdAt: number;
  sentAt: number | null;
};

export type MessageQuery = {
  direction: "in" | "out";
  appId?: string;
  status?: MessageStatus;
  // Exact match on to_email for out, from_email for in.
  email?: string;
  cursor?: string;
};

export type EventView = { type: string; occurredAt: number; detail: string | null };

export type ThreadItem = {
  id: string;
  direction: "in" | "out";
  subject: string | null;
  fromEmail: string | null;
  createdAt: number;
};

export type MessageDetail = MessageView & { events: EventView[]; thread: ThreadItem[] };

type Db = DrizzleSqliteDODatabase<typeof schema>;

const PAGE_SIZE = 50;
const THREAD_LIMIT = 20;
const ID_SHAPE = /^[a-z]{3}_[0-9A-Za-z_-]{12}$/;

export function encodeCursor(createdAt: number, id: string): string {
  return `${createdAt}.${id}`;
}

export function decodeCursor(raw: string): { createdAt: number; id: string } | null {
  const dot = raw.indexOf(".");
  if (dot < 1) return null;
  const ts = raw.slice(0, dot);
  const id = raw.slice(dot + 1);
  if (!/^\d{1,15}$/.test(ts) || !ID_SHAPE.test(id)) return null;
  return { createdAt: Number(ts), id };
}

// Non-correlated: the granted ids reach SQL as one bound JSON array, so the bound-parameter limit never applies.
export function visibleTo(access: MessageAccess): SQL {
  const m = schema.message;
  const inbound =
    access.inbound === "all"
      ? sql`${m.direction} = 'in'`
      : sql`${m.direction} = 'in' AND ${m.addressId} IN (SELECT value FROM json_each(${JSON.stringify(access.inbound)}))`;
  return access.out ? sql`(${m.direction} = 'out' OR (${inbound}))` : sql`(${inbound})`;
}

export type SuppressionView = { email: string; reason: SuppressionReason; stream: Stream | null; createdAt: number };

const SUPPRESSION_PAGE = 50;

// Range, not LIKE: the primary key serves it and no wildcard in an address needs escaping. char(1114111) is the largest code point.
export function listSuppressionRows(
  db: Db,
  q: { prefix?: string; cursor?: string },
): { rows: SuppressionView[]; nextCursor: string | null } {
  const s = schema.suppression;
  const rows = db
    .select({ email: s.email, reason: s.reason, stream: s.stream, createdAt: s.createdAt })
    .from(s)
    .where(
      and(
        q.prefix ? sql`${s.email} >= ${q.prefix} AND ${s.email} < (${q.prefix} || char(1114111))` : undefined,
        q.cursor ? gt(s.email, q.cursor) : undefined,
      ),
    )
    .orderBy(asc(s.email))
    .limit(SUPPRESSION_PAGE + 1)
    .all()
    .map((r): SuppressionView => ({ ...r, reason: r.reason as SuppressionReason, stream: r.stream as Stream | null }));
  const page = rows.slice(0, SUPPRESSION_PAGE);
  const nextCursor = rows.length > SUPPRESSION_PAGE ? page[SUPPRESSION_PAGE - 1].email : null;
  return { rows: page, nextCursor };
}

// No payloadKey and no response body: the console shows status, attempts and the fixed reason only.
export type DeliveryView = {
  id: string;
  messageId: string;
  event: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
};

export function listDeliveryRows(
  db: Db,
  q: { appId: string; webhookId: string; cursor?: string; visible: "all" | string[] },
): { rows: DeliveryView[]; nextCursor: string | null } {
  const d = schema.webhookDelivery;
  const m = schema.message;
  const cursor = q.cursor === undefined ? undefined : decodeCursor(q.cursor);
  if (q.cursor !== undefined && !cursor) throw new Error("invalid cursor");
  const rows = db
    .select({
      id: d.id,
      messageId: d.messageId,
      event: d.event,
      status: d.status,
      attempts: d.attempts,
      responseStatus: d.responseStatus,
      lastError: d.lastError,
      nextAttemptAt: d.nextAttemptAt,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })
    .from(d)
    .leftJoin(m, eq(m.id, d.messageId))
    .where(
      and(
        eq(d.appId, q.appId),
        eq(d.webhookId, q.webhookId),
        // Outbound-only deliveries have no address, so the restricted filter drops them.
        q.visible === "all" ? undefined : sql`${m.addressId} IN (SELECT value FROM json_each(${JSON.stringify(q.visible)}))`,
        cursor
          ? or(lt(d.createdAt, cursor.createdAt), and(eq(d.createdAt, cursor.createdAt), lt(d.id, cursor.id)))
          : undefined,
      ),
    )
    .orderBy(desc(d.createdAt), desc(d.id))
    .limit(PAGE_SIZE + 1)
    .all()
    .map((r): DeliveryView => ({ ...r, status: r.status as DeliveryView["status"] }));
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const nextCursor = rows.length > PAGE_SIZE && last ? encodeCursor(last.createdAt, last.id) : null;
  return { rows: page, nextCursor };
}

export type FailureView = {
  id: string;
  appId: string | null;
  addressId: string | null;
  envelopeFrom: string | null;
  envelopeTo: string;
  error: string;
  attempts: number;
  receivedAt: number;
  updatedAt: number;
};

// shortcut: 100 newest only, add a cursor if a workspace keeps more failures
export function listInboundFailureRows(db: Db, inbound: "all" | string[]): FailureView[] {
  const f = schema.inboundFailure;
  return db
    .select({
      id: f.id,
      appId: f.appId,
      addressId: f.addressId,
      envelopeFrom: f.envelopeFrom,
      envelopeTo: f.envelopeTo,
      error: f.error,
      attempts: f.attempts,
      receivedAt: f.receivedAt,
      updatedAt: f.updatedAt,
    })
    .from(f)
    .where(inbound === "all" ? undefined : sql`${f.addressId} IN (SELECT value FROM json_each(${JSON.stringify(inbound)}))`)
    .orderBy(desc(f.receivedAt))
    .limit(100)
    .all();
}

export function getInboundFailureRow(db: Db, id: string): (FailureView & { rawKey: string; authResults: string | null }) | null {
  const f = schema.inboundFailure;
  const [row] = db
    .select({
      id: f.id,
      rawKey: f.rawKey,
      appId: f.appId,
      addressId: f.addressId,
      envelopeFrom: f.envelopeFrom,
      envelopeTo: f.envelopeTo,
      authResults: f.authResults,
      error: f.error,
      attempts: f.attempts,
      receivedAt: f.receivedAt,
      updatedAt: f.updatedAt,
    })
    .from(f)
    .where(eq(f.id, id))
    .limit(1)
    .all();
  return row ?? null;
}

export function listMessageRows(
  db: Db,
  q: MessageQuery,
  access: MessageAccess,
): { rows: MessageSummary[]; nextCursor: string | null } {
  const m = schema.message;
  const cursor = q.cursor === undefined ? undefined : decodeCursor(q.cursor);
  if (q.cursor !== undefined && !cursor) throw new Error("invalid cursor");
  const rows = db
    .select({
      id: m.id,
      appId: m.appId,
      direction: m.direction,
      status: m.status,
      fromEmail: m.fromEmail,
      toEmail: m.toEmail,
      subject: m.subject,
      error: m.error,
      createdAt: m.createdAt,
      sentAt: m.sentAt,
    })
    .from(m)
    .where(
      and(
        visibleTo(access),
        eq(m.direction, q.direction),
        q.appId ? eq(m.appId, q.appId) : undefined,
        q.status ? eq(m.status, q.status) : undefined,
        q.email ? eq(q.direction === "out" ? m.toEmail : m.fromEmail, q.email) : undefined,
        cursor
          ? or(lt(m.createdAt, cursor.createdAt), and(eq(m.createdAt, cursor.createdAt), lt(m.id, cursor.id)))
          : undefined,
      ),
    )
    .orderBy(desc(m.createdAt), desc(m.id))
    .limit(PAGE_SIZE + 1)
    .all()
    .map((r): MessageSummary => ({ ...r, direction: r.direction as "in" | "out", status: r.status as MessageStatus }));
  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  const nextCursor = rows.length > PAGE_SIZE && last ? encodeCursor(last.createdAt, last.id) : null;
  return { rows: page, nextCursor };
}

// The label, the preview hint and the download share one name, so a bidi override never shows a false extension.
export function attachmentViews(db: Db, messageId: string): AttachmentView[] {
  return db
    .select({
      id: schema.attachment.id,
      filename: schema.attachment.filename,
      contentType: schema.attachment.contentType,
      sizeBytes: schema.attachment.sizeBytes,
      contentId: schema.attachment.contentId,
      position: schema.attachment.position,
    })
    .from(schema.attachment)
    .where(eq(schema.attachment.messageId, messageId))
    .orderBy(asc(schema.attachment.position))
    .all()
    .map((a) => ({ ...a, filename: safeDownloadName(a.filename, `attachment-${a.position}`) }));
}

// Stored Message-ID values are bare (no angle brackets), space-separated in the reply headers.
function referencedIds(...headers: (string | null)[]): string[] {
  const ids = headers
    .flatMap((h) => (h ?? "").split(/\s+/))
    .map((id) => id.replace(/^<(.*)>$/, "$1"))
    .filter(Boolean);
  return [...new Set(ids)];
}

// The thread is other letters of the same app that this one replies to, or that reply to it. Rows the reader cannot see are left out.
function threadOf(
  db: Db,
  row: { id: string; appId: string; rfcMessageId: string | null; inReplyTo: string | null; rfcReferences: string | null },
  access: MessageAccess,
): ThreadItem[] {
  const m = schema.message;
  const parents = referencedIds(row.inReplyTo, row.rfcReferences);
  const link = or(
    parents.length > 0
      ? and(eq(m.direction, "in"), sql`${m.rfcMessageId} IN (SELECT value FROM json_each(${JSON.stringify(parents)}))`)
      : undefined,
    row.rfcMessageId ? eq(m.inReplyTo, row.rfcMessageId) : undefined,
  );
  if (!link) return [];
  return db
    .select({ id: m.id, direction: m.direction, subject: m.subject, fromEmail: m.fromEmail, createdAt: m.createdAt })
    .from(m)
    .where(and(eq(m.appId, row.appId), ne(m.id, row.id), visibleTo(access), link))
    .orderBy(asc(m.createdAt), asc(m.id))
    .limit(THREAD_LIMIT)
    .all()
    .map((r): ThreadItem => ({ ...r, direction: r.direction as "in" | "out" }));
}

// Campaign messages keep no html or text of their own: they render from the campaign row and their merge data.
// Null means "not a campaign message" or "the campaign or its merge data is gone"; the caller decides which.
export type MessageBody = { html: string; text: string };

export function messageBody(db: Db, row: { campaignId: string | null; mergeData: string | null }): MessageBody | null {
  const merge = parseMergeData(row.mergeData);
  if (!row.campaignId || !merge) return null;
  const c = db
    .select({ html: schema.campaign.html, text: schema.campaign.text, postalAddress: schema.campaign.postalAddress })
    .from(schema.campaign)
    .where(eq(schema.campaign.id, row.campaignId))
    .get();
  if (!c) return null;
  const values = contactValues(merge, c.postalAddress ?? "");
  return { html: renderMerge(c.html, values, "html"), text: renderMerge(c.text, values, "text") };
}

// The R2 key comes only from the stored row; the URL names just the part.
// contentType is the stored type of an attachment, and null for the html and raw parts.
// A body is html rendered on read for a campaign message, so it needs no R2 read.
export type MessageFile = { key: string; name: string; contentType: string | null } | { body: string; name: string; contentType: null };

export function readMessageFile(db: Db, id: string, part: string, access: MessageAccess): MessageFile | null {
  const row = db
    .select({
      direction: schema.message.direction,
      htmlKey: schema.message.htmlKey,
      rawKey: schema.message.rawKey,
      campaignId: schema.message.campaignId,
      mergeData: schema.message.mergeData,
    })
    .from(schema.message)
    .where(and(eq(schema.message.id, id), visibleTo(access)))
    .get();
  if (!row) return null;
  if (part === "html") {
    const body = messageBody(db, row);
    if (body) return { body: body.html, name: `${id}.html`, contentType: null };
    return row.htmlKey ? { key: row.htmlKey, name: `${id}.html`, contentType: null } : null;
  }
  if (part === "raw")
    return row.direction === "in" && row.rawKey ? { key: row.rawKey, name: `${id}.eml`, contentType: null } : null;
  const file = db
    .select({
      r2Key: schema.attachment.r2Key,
      filename: schema.attachment.filename,
      position: schema.attachment.position,
      contentType: schema.attachment.contentType,
    })
    .from(schema.attachment)
    .where(and(eq(schema.attachment.id, part), eq(schema.attachment.messageId, id)))
    .get();
  return file
    ? {
        key: file.r2Key,
        name: safeDownloadName(file.filename, `attachment-${file.position}`),
        contentType: file.contentType,
      }
    : null;
}

export async function readMessageDetail(db: Db, env: Env, id: string, access: MessageAccess): Promise<MessageDetail | null> {
  const row = db
    .select()
    .from(schema.message)
    .where(and(eq(schema.message.id, id), visibleTo(access)))
    .get();
  if (!row) return null;
  const events = db
    .select({ type: schema.messageEvent.type, occurredAt: schema.messageEvent.occurredAt, detail: schema.messageEvent.detail })
    .from(schema.messageEvent)
    .where(eq(schema.messageEvent.messageId, id))
    .orderBy(asc(schema.messageEvent.occurredAt), asc(schema.messageEvent.id))
    .all();
  const body = messageBody(db, row);
  const object = row.htmlKey ? await env.MAIL.get(row.htmlKey) : null;
  return {
    ...row,
    html: body?.html ?? (object ? await object.text() : null),
    text: body?.text ?? row.text,
    attachments: attachmentViews(db, id),
    events,
    thread: threadOf(db, row, access),
  };
}
