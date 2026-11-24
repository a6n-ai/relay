// Test seam: counts committed migration scripts and calls to migrate, so tests can prove each runs once and migrate runs once per DO.
export const applied = { count: 0, calls: 0 };

// Index + 1 is the stored schema_version. Keep in sync with client-schema.ts.
export const CLIENT_MIGRATIONS: readonly string[] = [
  `
CREATE TABLE message (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  direction TEXT NOT NULL,
  stream TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT,
  event TEXT,
  campaign_id TEXT,
  from_email TEXT,
  to_email TEXT,
  subject TEXT,
  text TEXT,
  html_key TEXT,
  raw_key TEXT,
  ses_message_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  opens INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sent_at INTEGER,
  CONSTRAINT message_channel CHECK (channel = 'email'),
  CONSTRAINT message_direction CHECK (direction IN ('out', 'in')),
  CONSTRAINT message_stream CHECK (stream IN ('transactional', 'tracked', 'marketing')),
  CONSTRAINT message_status CHECK (status IN ('queued', 'sent', 'failed', 'suppressed'))
);
CREATE INDEX message_status_created_at ON message (status, created_at);
CREATE INDEX message_campaign_status ON message (campaign_id, status);
CREATE INDEX message_to_email ON message (to_email);
CREATE UNIQUE INDEX message_app_idempotency_unique ON message (app_id, idempotency_key);

CREATE TABLE suppression (
  email TEXT PRIMARY KEY NOT NULL,
  reason TEXT NOT NULL,
  stream TEXT,
  created_at INTEGER NOT NULL,
  CONSTRAINT suppression_email_lower CHECK (email = lower(trim(email))),
  CONSTRAINT suppression_reason CHECK (reason IN ('unsubscribe', 'bounce', 'complaint', 'manual')),
  CONSTRAINT suppression_stream CHECK (stream IS NULL OR stream IN ('transactional', 'tracked', 'marketing'))
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  data TEXT,
  created_at INTEGER NOT NULL
);
`,
`
ALTER TABLE message ADD COLUMN ses_region TEXT;
ALTER TABLE message ADD COLUMN from_name TEXT;
ALTER TABLE message ADD COLUMN claimed_until INTEGER;
CREATE INDEX message_ses_message_id ON message (ses_message_id);

CREATE TABLE message_event (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  type TEXT NOT NULL,
  sns_message_id TEXT NOT NULL UNIQUE,
  recipient TEXT,
  detail TEXT,
  occurred_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  CONSTRAINT message_event_type CHECK (type IN ('Send', 'Delivery', 'Bounce', 'Complaint', 'Reject', 'DeliveryDelay', 'RenderingFailure', 'Open', 'Click'))
);
CREATE INDEX message_event_message ON message_event (message_id, occurred_at);
`,
`
ALTER TABLE message ADD COLUMN address_id TEXT;
ALTER TABLE message ADD COLUMN rfc_message_id TEXT;
ALTER TABLE message ADD COLUMN in_reply_to TEXT;
ALTER TABLE message ADD COLUMN rfc_references TEXT;
ALTER TABLE message ADD COLUMN envelope_from TEXT;
ALTER TABLE message ADD COLUMN auth_results TEXT;
CREATE UNIQUE INDEX message_raw_key_unique ON message (raw_key);
CREATE UNIQUE INDEX message_in_rfc_unique ON message (app_id, rfc_message_id) WHERE direction = 'in';
CREATE INDEX message_address_created ON message (address_id, created_at);

CREATE TABLE attachment (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_id TEXT,
  r2_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX attachment_message_position ON attachment (message_id, position);

CREATE TABLE webhook (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret_enc TEXT NOT NULL,
  events TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX webhook_app ON webhook (app_id);

CREATE TABLE webhook_delivery (
  id TEXT PRIMARY KEY NOT NULL,
  webhook_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  claimed_until INTEGER,
  last_error TEXT,
  response_status INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CONSTRAINT webhook_delivery_status CHECK (status IN ('pending', 'sent', 'failed'))
);
CREATE UNIQUE INDEX webhook_delivery_unique ON webhook_delivery (webhook_id, message_id, event);
CREATE INDEX webhook_delivery_status ON webhook_delivery (status, updated_at);

CREATE TABLE inbound_failure (
  id TEXT PRIMARY KEY NOT NULL,
  raw_key TEXT NOT NULL UNIQUE,
  app_id TEXT,
  address_id TEXT,
  envelope_from TEXT,
  envelope_to TEXT NOT NULL,
  auth_results TEXT,
  received_at INTEGER NOT NULL,
  error TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`,
`
CREATE INDEX message_direction_created ON message (direction, created_at, id);
CREATE INDEX message_in_reply_to ON message (in_reply_to);
CREATE INDEX webhook_delivery_webhook_created ON webhook_delivery (webhook_id, created_at, id);
`,
`
ALTER TABLE webhook_delivery ADD COLUMN retried_at INTEGER;
`,
`
ALTER TABLE message ADD COLUMN unsubscribed_at INTEGER;
ALTER TABLE message ADD COLUMN merge_data TEXT;
CREATE TABLE contact_list (
  id TEXT PRIMARY KEY NOT NULL, app_id TEXT NOT NULL, name TEXT NOT NULL,
  consent_source TEXT NOT NULL, consent_note TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  CONSTRAINT contact_list_consent CHECK (consent_source IN ('purchase', 'express_optin', 'event_signup', 'import_other'))
);
CREATE INDEX contact_list_app_created ON contact_list (app_id, created_at, id);
CREATE TABLE contact_list_member (
  id TEXT PRIMARY KEY NOT NULL, list_id TEXT NOT NULL, app_id TEXT NOT NULL, email TEXT NOT NULL,
  first_name TEXT, last_name TEXT, source TEXT NOT NULL, consent_at INTEGER NOT NULL,
  unsubscribed_at INTEGER, created_at INTEGER NOT NULL,
  CONSTRAINT member_email_lower CHECK (email = lower(trim(email))),
  CONSTRAINT member_source CHECK (source IN ('manual', 'import'))
);
CREATE UNIQUE INDEX contact_list_member_list_email ON contact_list_member (list_id, email);
CREATE INDEX contact_list_member_list_created ON contact_list_member (list_id, created_at, id);
CREATE INDEX contact_list_member_email ON contact_list_member (email);
CREATE TABLE campaign (
  id TEXT PRIMARY KEY NOT NULL, app_id TEXT NOT NULL, name TEXT NOT NULL,
  stream TEXT NOT NULL DEFAULT 'marketing', status TEXT NOT NULL DEFAULT 'draft',
  from_email TEXT, subject TEXT NOT NULL DEFAULT '', html TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '',
  list_ids TEXT NOT NULL DEFAULT '[]', scheduled_at INTEGER, run_seq INTEGER NOT NULL DEFAULT 0,
  cursor TEXT, recipients INTEGER NOT NULL DEFAULT 0, error TEXT, postal_address TEXT,
  queued INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
  suppressed INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0, opened INTEGER NOT NULL DEFAULT 0,
  clicked INTEGER NOT NULL DEFAULT 0, bounced INTEGER NOT NULL DEFAULT 0, complained INTEGER NOT NULL DEFAULT 0,
  unsubscribed INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER, finished_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  CONSTRAINT campaign_stream CHECK (stream IN ('transactional', 'tracked', 'marketing')),
  CONSTRAINT campaign_status CHECK (status IN ('draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled'))
);
CREATE INDEX campaign_created ON campaign (created_at, id);
`,
];

// PRAGMA user_version is rejected by DO SQL (SQLITE_AUTH), so the version lives in sync KV.
// KV and SQL share one SQLite store, so each script and its version commit together.
export function migrate(storage: DurableObjectStorage): number {
  applied.calls++;
  let version = storage.kv.get<number>("schema_version") ?? 0;
  for (; version < CLIENT_MIGRATIONS.length; version++) {
    const next = version + 1;
    storage.transactionSync(() => {
      storage.sql.exec(CLIENT_MIGRATIONS[version]);
      storage.kv.put("schema_version", next);
    });
    applied.count++;
  }
  return version;
}
