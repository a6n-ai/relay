-- Cutover: every member gets a direct grant on each catalog mailbox of their workspace. Re-running inserts nothing.
-- The public id subquery is correlated on purpose (see 0007). created_at is set here because raw SQL skips the Drizzle default.
INSERT INTO mailbox_grant (public_id, created_at, organization_id, mailbox_id, member_id)
SELECT
  'mgr_' || (SELECT string_agg(substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-', 1 + floor(random() * 64)::int, 1), '') FROM generate_series(1, 12) WHERE m.id IS NOT NULL),
  (extract(epoch FROM now()) * 1000)::bigint,
  m.organization_id,
  b.id,
  m.id
FROM member m
JOIN tenants t ON t.organization_id = m.organization_id
JOIN tenant_mailboxes b ON b.tenant_id = t.id
ON CONFLICT DO NOTHING;
