import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { newId } from "../lib/ids";

// Mirrors CLIENT_MIGRATIONS[0] in migrations.ts; change both together.
export const message = sqliteTable(
  "message",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("msg")),
    appId: text("app_id").notNull(),
    channel: text("channel").notNull().default("email"),
    direction: text("direction").notNull(),
    stream: text("stream").notNull(),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key").unique(),
    event: text("event"),
    campaignId: text("campaign_id"),
    fromEmail: text("from_email"),
    toEmail: text("to_email"),
    subject: text("subject"),
    text: text("text"),
    htmlKey: text("html_key"),
    rawKey: text("raw_key"),
    sesMessageId: text("ses_message_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    opens: integer("opens").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    sentAt: integer("sent_at"),
  },
  (t) => [
    check("message_channel", sql`${t.channel} = 'email'`),
    check("message_direction", sql`${t.direction} IN ('out', 'in')`),
    check("message_stream", sql`${t.stream} IN ('transactional', 'tracked', 'marketing')`),
    check("message_status", sql`${t.status} IN ('queued', 'sent', 'failed', 'suppressed')`),
    index("message_status_created_at").on(t.status, t.createdAt),
    index("message_campaign_status").on(t.campaignId, t.status),
    index("message_to_email").on(t.toEmail),
  ],
);

export const suppression = sqliteTable(
  "suppression",
  {
    email: text("email").primaryKey(),
    reason: text("reason").notNull(),
    stream: text("stream"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check("suppression_email_lower", sql`${t.email} = lower(trim(${t.email}))`),
    check("suppression_reason", sql`${t.reason} IN ('unsubscribe', 'bounce', 'complaint', 'manual')`),
    check("suppression_stream", sql`${t.stream} IS NULL OR ${t.stream} IN ('transactional', 'tracked', 'marketing')`),
  ],
);

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey().$defaultFn(() => newId("aud")),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  data: text("data"),
  createdAt: integer("created_at").notNull(),
});
