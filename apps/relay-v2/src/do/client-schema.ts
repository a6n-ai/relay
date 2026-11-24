import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { newId } from "../lib/ids";

// Mirrors CLIENT_MIGRATIONS in migrations.ts; change both together.
export const message = sqliteTable(
  "message",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("msg")),
    appId: text("app_id").notNull(),
    channel: text("channel").notNull().default("email"),
    direction: text("direction").notNull(),
    stream: text("stream").notNull(),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key"),
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
    sesRegion: text("ses_region"),
    fromName: text("from_name"),
    claimedUntil: integer("claimed_until"),
    addressId: text("address_id"),
    rfcMessageId: text("rfc_message_id"),
    inReplyTo: text("in_reply_to"),
    rfcReferences: text("rfc_references"),
    envelopeFrom: text("envelope_from"),
    authResults: text("auth_results"),
  },
  (t) => [
    check("message_channel", sql`${t.channel} = 'email'`),
    check("message_direction", sql`${t.direction} IN ('out', 'in')`),
    check("message_stream", sql`${t.stream} IN ('transactional', 'tracked', 'marketing')`),
    check("message_status", sql`${t.status} IN ('queued', 'sent', 'failed', 'suppressed')`),
    index("message_status_created_at").on(t.status, t.createdAt),
    index("message_campaign_status").on(t.campaignId, t.status),
    index("message_to_email").on(t.toEmail),
    uniqueIndex("message_app_idempotency_unique").on(t.appId, t.idempotencyKey),
    index("message_ses_message_id").on(t.sesMessageId),
    uniqueIndex("message_raw_key_unique").on(t.rawKey),
    uniqueIndex("message_in_rfc_unique").on(t.appId, t.rfcMessageId).where(sql`${t.direction} = 'in'`),
    index("message_address_created").on(t.addressId, t.createdAt),
  ],
);

export const messageEvent = sqliteTable(
  "message_event",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("mev")),
    messageId: text("message_id").notNull(),
    type: text("type").notNull(),
    snsMessageId: text("sns_message_id").notNull().unique(),
    recipient: text("recipient"),
    detail: text("detail"),
    occurredAt: integer("occurred_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check(
      "message_event_type",
      sql`${t.type} IN ('Send', 'Delivery', 'Bounce', 'Complaint', 'Reject', 'DeliveryDelay', 'RenderingFailure', 'Open', 'Click')`,
    ),
    index("message_event_message").on(t.messageId, t.occurredAt),
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

export const attachment = sqliteTable(
  "attachment",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("att")),
    messageId: text("message_id").notNull(),
    appId: text("app_id").notNull(),
    position: integer("position").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentId: text("content_id"),
    r2Key: text("r2_key").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("attachment_message_position").on(t.messageId, t.position)],
);

export const webhook = sqliteTable(
  "webhook",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("whk")),
    appId: text("app_id").notNull(),
    url: text("url").notNull(),
    secretEnc: text("secret_enc").notNull(),
    events: text("events").notNull(),
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("webhook_app").on(t.appId)],
);

export const webhookDelivery = sqliteTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("whd")),
    webhookId: text("webhook_id").notNull(),
    appId: text("app_id").notNull(),
    messageId: text("message_id").notNull(),
    event: text("event").notNull(),
    payloadKey: text("payload_key").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    claimedUntil: integer("claimed_until"),
    lastError: text("last_error"),
    responseStatus: integer("response_status"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("webhook_delivery_status", sql`${t.status} IN ('pending', 'sent', 'failed')`),
    uniqueIndex("webhook_delivery_unique").on(t.webhookId, t.messageId, t.event),
    index("webhook_delivery_status").on(t.status, t.updatedAt),
  ],
);

export const inboundFailure = sqliteTable("inbound_failure", {
  id: text("id").primaryKey().$defaultFn(() => newId("ibf")),
  rawKey: text("raw_key").notNull().unique(),
  appId: text("app_id"),
  addressId: text("address_id"),
  envelopeFrom: text("envelope_from"),
  envelopeTo: text("envelope_to").notNull(),
  authResults: text("auth_results"),
  receivedAt: integer("received_at").notNull(),
  error: text("error").notNull(),
  attempts: integer("attempts").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
