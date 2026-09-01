# Testing Relay

Three layers. Unit tests are the gate (`pnpm test`). Local Postgres is for
migrate/seed and the operator UI. Manual checks cover DNS and SMTP you cannot
fake in CI.

## 1. Automated (always)

```bash
pnpm install
pnpm typecheck
pnpm test
```

Packages already cover engine (outbox, campaigns, lists, compliance, drain),
email (SES/SMTP/domain DNS), SMS keywords, WhatsApp session window, and the
HTTP SDK.

The operator app (`apps/relay`) now unit-tests:

| Area | File |
| --- | --- |
| API key hash / Bearer | `lib/api-keys.test.ts` |
| Tenant / SMTP / domain forms | `lib/tenants/forms.test.ts`, `lib/email/smtp-form.test.ts`, `lib/email/domain-form.test.ts` |
| `POST /v1/messages` body | `lib/v1/message-body.test.ts` |
| Session cookie gate | `lib/auth/public-paths.test.ts` |
| Audit diffs + secret redaction | `lib/audit/*.test.ts` |
| SMTP env hydrate | `lib/email/smtp-env.test.ts` |
| SES bounce/complaint mapping | `lib/notifications/ses-events.test.ts` |
| Permissions statement | `lib/auth/permissions.test.ts` |

## 2. Local stack (Postgres + app)

Needs Docker (or any Postgres 16 that matches `.env.example`).

```bash
docker compose up -d
cp apps/relay/.env.example apps/relay/.env.local
# BETTER_AUTH_SECRET must be a long random string
pnpm --filter relay db:migrate
SEED_ADMIN_PASSWORD=dev pnpm --filter relay db:seed
pnpm dev   # http://localhost:3010
```

Seed prints operator email (`ops@relay.local` unless `SEED_ADMIN_EMAIL` is set)
and one-time tenant API secrets (`realm-dev`, `tiffin-grab`, `puchkaman`). Copy
the secrets; they are not stored in plaintext.

### Smoke the public API

```bash
curl -sS -D - -o /tmp/relay-msg.json \
  -H "Authorization: Bearer $RELAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","body":"World","to":{"email":"dev@example.com"}}' \
  http://localhost:3010/v1/messages
# expect 202 { "accepted": true }
```

Without a key, expect **401**. Invalid JSON / missing recipient → **400**.

### Operator UI

Sign in at `/login` (password from seed). Then:

1. **Tenants** — create a tenant; copy the API key; provision Tiffin Grab +
   Puchkaman if they were not seeded.
2. **Sending** — save SMTP host/port (Mailpit, Mailhog, or a real relay).
   Password is redacted in audit.
3. **Domains** — add `example.test`; confirm TXT rows (ownership, SPF, DKIM,
   DMARC). Check DNS should stay pending until `_relay-verify` exists.
4. **Logs / templates** — pages render (campaign tables still live in engine;
   this app is the tenant + sending control plane).

## 3. Manual / live (not in CI)

- Publish `_relay-verify`, SPF, DKIM, DMARC on a real domain and use Check DNS.
- Send through SMTP and confirm `messageId` in the provider.
- CASL/CAN-SPAM/GDPR: marketing enqueue vs unsubscribe (engine unit tests cover
  the rules; live send needs a verified domain).

## Package cases (already implemented)

- **Compliance:** US opt-out, CA 730-day implied purchase, EU/UK express opt-in,
  physical address, unsubscribe always blocks.
- **Audience:** consent + recipient dedupe.
- **SMTP provider:** maps to `sendMail`; errors without `messageId`.
- **Domain:** chunked TXT ownership, PEM → DKIM `p=`, Hostinger-style hosts.
- **Outbox:** 6 attempts, 1m→1h backoff (`drain.test.ts`).
- **SDK:** Bearer POST `/v1/messages`.
