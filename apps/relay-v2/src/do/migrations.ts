// Test seam: counts committed migration scripts so tests can prove each runs once.
export const applied = { count: 0 };

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
  idempotency_key TEXT UNIQUE,
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
];

// PRAGMA user_version is rejected by DO SQL (SQLITE_AUTH), so the version lives in sync KV.
// KV and SQL share one SQLite store, so each script and its version commit together.
export function migrate(storage: DurableObjectStorage): number {
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
