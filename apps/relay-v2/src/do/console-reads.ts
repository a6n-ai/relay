import { and, asc, desc, eq, lt, ne, or, sql, type SQL } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { safeDownloadName } from "../core/download";
import type { Env } from "../env";
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
  if (!/^\d{1,16}$/.test(ts) || !ID_SHAPE.test(id)) return null;
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
    .all();
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

// The R2 key comes only from the stored row; the URL names just the part.
// contentType is the stored type of an attachment, and null for the html and raw parts.
export type MessageFile = { key: string; name: string; contentType: string | null };

export function readMessageFile(db: Db, id: string, part: string, access: MessageAccess): MessageFile | null {
  const row = db
    .select({ direction: schema.message.direction, htmlKey: schema.message.htmlKey, rawKey: schema.message.rawKey })
    .from(schema.message)
    .where(and(eq(schema.message.id, id), visibleTo(access)))
    .get();
  if (!row) return null;
  if (part === "html")
    return row.htmlKey ? { key: row.htmlKey, name: `${id}.html`, contentType: null } : null;
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
  const object = row.htmlKey ? await env.MAIL.get(row.htmlKey) : null;
  return {
    ...row,
    html: object ? await object.text() : null,
    attachments: attachmentViews(db, id),
    events,
    thread: threadOf(db, row, access),
  };
}
