-- Verified or unverified senders become catalog send-as rows. Re-running changes nothing.
-- The id subquery is correlated on purpose: an uncorrelated one runs once per statement, so every row would get the same public id.
INSERT INTO tenant_mailboxes (public_id, created_at, updated_at, tenant_id, local_part, domain, email, kind, display_name, verified_at, can_send)
SELECT
  'tmb_' || (SELECT string_agg(substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-', 1 + floor(random() * 64)::int, 1), '') FROM generate_series(1, 12) WHERE s.id IS NOT NULL),
  (extract(epoch from now()) * 1000)::bigint,
  (extract(epoch from now()) * 1000)::bigint,
  s.tenant_id,
  split_part(lower(trim(s.email)), '@', 1),
  split_part(lower(trim(s.email)), '@', 2),
  lower(trim(s.email)),
  'send_as',
  s.display_name,
  s.verified_at,
  true
FROM tenant_email_senders s
ON CONFLICT (tenant_id, email) DO UPDATE SET
  display_name = COALESCE(tenant_mailboxes.display_name, EXCLUDED.display_name),
  verified_at = EXCLUDED.verified_at,
  can_send = true;--> statement-breakpoint
-- Letters point at their own tenant's catalog row. Inbound matches the recipient, outbound the sender.
UPDATE email_mailbox m SET mailbox_id = b.id
FROM tenant_mailboxes b
WHERE m.mailbox_id IS NULL
  AND m.tenant_id IS NOT NULL
  AND b.tenant_id = m.tenant_id
  AND b.email = lower(trim(CASE WHEN m.direction = 'in' THEN m.to_email ELSE m.from_email END));
