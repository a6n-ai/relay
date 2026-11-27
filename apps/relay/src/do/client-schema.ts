import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { newId } from "../shared/ids";

// The migrations in migrations.ts are what runs.
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
    unsubscribedAt: integer("unsubscribed_at"),
    mergeData: text("merge_data"),
    replyTo: text("reply_to"),
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
    index("message_direction_created").on(t.direction, t.createdAt, t.id),
    index("message_in_reply_to").on(t.inReplyTo),
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
    retriedAt: integer("retried_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("webhook_delivery_status", sql`${t.status} IN ('pending', 'sent', 'failed')`),
    uniqueIndex("webhook_delivery_unique").on(t.webhookId, t.messageId, t.event),
    index("webhook_delivery_status").on(t.status, t.updatedAt),
    index("webhook_delivery_webhook_created").on(t.webhookId, t.createdAt, t.id),
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

// Mirrors migrations.ts; the SQL there is what runs.
export const contactList = sqliteTable(
  "contact_list",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("ctl")),
    appId: text("app_id").notNull(),
    name: text("name").notNull(),
    consentSource: text("consent_source").notNull(),
    consentNote: text("consent_note"),
    importRef: text("import_ref"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("contact_list_consent", sql`${t.consentSource} IN ('purchase', 'express_optin', 'event_signup', 'import_other')`),
    index("contact_list_app_created").on(t.appId, t.createdAt, t.id),
    uniqueIndex("contact_list_import_ref").on(t.appId, t.importRef).where(sql`${t.importRef} IS NOT NULL`),
  ],
);

export const contactListMember = sqliteTable(
  "contact_list_member",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("clm")),
    listId: text("list_id").notNull(),
    appId: text("app_id").notNull(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    source: text("source").notNull(),
    consentAt: integer("consent_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    check("member_email_lower", sql`${t.email} = lower(trim(${t.email}))`),
    check("member_source", sql`${t.source} IN ('manual', 'import')`),
    uniqueIndex("contact_list_member_list_email").on(t.listId, t.email),
    index("contact_list_member_list_created").on(t.listId, t.createdAt, t.id),
    index("contact_list_member_email").on(t.email),
  ],
);

export const marketingOptout = sqliteTable(
  "marketing_optout",
  {
    email: text("email").notNull(),
    domain: text("domain").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.email, t.domain] })],
);

export const campaign = sqliteTable(
  "campaign",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("cmp")),
    appId: text("app_id").notNull(),
    name: text("name").notNull(),
    stream: text("stream").notNull().default("marketing"),
    status: text("status").notNull().default("draft"),
    fromEmail: text("from_email"),
    subject: text("subject").notNull().default(""),
    html: text("html").notNull().default(""),
    text: text("text").notNull().default(""),
    listIds: text("list_ids").notNull().default("[]"),
    audienceKind: text("audience_kind").notNull().default("lists"),
    audienceQuery: text("audience_query"),
    templateId: text("template_id"),
    importRef: text("import_ref"),
    scheduledAt: integer("scheduled_at"),
    runSeq: integer("run_seq").notNull().default(0),
    cursor: text("cursor"),
    recipients: integer("recipients").notNull().default(0),
    error: text("error"),
    postalAddress: text("postal_address"),
    queued: integer("queued").notNull().default(0),
    sent: integer("sent").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    suppressed: integer("suppressed").notNull().default(0),
    delivered: integer("delivered").notNull().default(0),
    opened: integer("opened").notNull().default(0),
    clicked: integer("clicked").notNull().default(0),
    bounced: integer("bounced").notNull().default(0),
    complained: integer("complained").notNull().default(0),
    unsubscribed: integer("unsubscribed").notNull().default(0),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("campaign_stream", sql`${t.stream} IN ('transactional', 'tracked', 'marketing')`),
    check("campaign_status", sql`${t.status} IN ('draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled')`),
    index("campaign_created").on(t.createdAt, t.id),
    uniqueIndex("campaign_import_ref").on(t.appId, t.importRef).where(sql`${t.importRef} IS NOT NULL`),
  ],
);

export const template = sqliteTable(
  "template",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("tpl")),
    appId: text("app_id").notNull(),
    name: text("name").notNull(),
    event: text("event"),
    locale: text("locale").notNull().default("en"),
    subject: text("subject").notNull().default(""),
    intro: text("intro"),
    html: text("html").notNull().default(""),
    text: text("text").notNull().default(""),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    importRef: text("import_ref"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("template_app_event")
      .on(t.appId, t.event, t.locale)
      .where(sql`${t.event} IS NOT NULL`),
    uniqueIndex("template_import_ref").on(t.appId, t.importRef).where(sql`${t.importRef} IS NOT NULL`),
    index("template_app_created").on(t.appId, t.createdAt, t.id),
  ],
);

export const automation = sqliteTable(
  "automation",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("aut")),
    appId: text("app_id").notNull(),
    name: text("name").notNull(),
    listId: text("list_id").notNull(),
    templateId: text("template_id").notNull(),
    fromEmail: text("from_email").notNull(),
    delayHours: integer("delay_hours").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    check("automation_delay", sql`${t.delayHours} BETWEEN 0 AND 720`),
    index("automation_list").on(t.listId),
  ],
);

export const automationRun = sqliteTable(
  "automation_run",
  {
    automationId: text("automation_id").notNull(),
    email: text("email").notNull(),
    dueAt: integer("due_at").notNull(),
    status: text("status").notNull().default("pending"),
    messageId: text("message_id"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.automationId, t.email] }),
    check("automation_run_status", sql`${t.status} IN ('pending', 'sent', 'skipped')`),
    index("automation_run_due").on(t.status, t.dueAt),
  ],
);

export const audienceHook = sqliteTable(
  "audience_hook",
  {
    appId: text("app_id").primaryKey().notNull(),
    kind: text("kind").notNull(),
    url: text("url"),
    binding: text("binding"),
    secretEnc: text("secret_enc"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [check("audience_hook_kind", sql`${t.kind} IN ('https', 'binding')`)],
);
