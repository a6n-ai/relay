# Testing Relay

Unit tests are the gate (`pnpm test`). Local Postgres is for migrate/seed and the operator UI. DNS and live SMTP stay manual.

## 1. Automated

```bash
pnpm install
pnpm typecheck
pnpm test
```

Packages cover engine (outbox, campaigns, lists, compliance, drain), email (SES/SMTP/domain DNS), SMS keywords, WhatsApp session window, and the HTTP SDK.

The operator app (`apps/relay`) unit-tests include:

| Area | File |
| --- | --- |
| API key hash / Bearer | `lib/api-keys.test.ts` |
| App / SMTP / domain forms | `lib/tenants/forms.test.ts`, `lib/email/smtp-form.test.ts`, `lib/email/domain-form.test.ts` |
| `POST /v1/messages` body | `lib/v1/message-body.test.ts` |
| OpenAPI catalog | `lib/v1/openapi.test.ts` |
| Session cookie gate (`/docs` public) | `lib/auth/public-paths.test.ts` |
| Mailbox listing / tags | `lib/mailbox/listing.test.ts`, `lib/mailbox/conversation-tag.test.ts` |
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

Seed prints operator email (`ops@relay.local` unless `SEED_ADMIN_EMAIL` is set) and one-time app API secrets. Copy the secrets; they are not stored in plaintext.

Sign-up is disabled. Log in at `/login` with the seed password.

### Smoke send

```bash
curl -sS -D - -o /tmp/relay-msg.json \
  -H "Authorization: Bearer $RELAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","body":"World","to":{"email":"dev@example.com"}}' \
  http://localhost:3010/v1/messages
# expect 202 { "accepted": true }
```

Without a key, expect **401**. Invalid JSON / missing recipient → **400**.

### Public docs

While the app is running:

- [http://localhost:3010/docs](http://localhost:3010/docs)
- [http://localhost:3010/docs/api](http://localhost:3010/docs/api) (Scalar)
- [http://localhost:3010/docs/api/swagger](http://localhost:3010/docs/api/swagger)
- [http://localhost:3010/v1/openapi.json](http://localhost:3010/v1/openapi.json)

Operator JSON (mailbox, tags, team, apps, campaigns, people, automations) needs a signed-in session cookie. Send uses the Bearer key only.

### Operator UI

1. **Apps** — create an app; copy the API key once.
2. **Email sending** — save SMTP (Mailpit, Mailhog, or a real relay) or SES env. Password is redacted in audit.
3. **Email sending → domains** — add `example.test`; confirm TXT rows (ownership, SPF, DKIM, DMARC). Check DNS stays pending until `_relay-verify` exists.
4. **Mailbox** — list conversations; Reply stays on the thread; chips include origin and app tags.
5. **Tags** (Settings) — add a label on an app; Mailbox listing shows that chip on letters for that app. Letters with no app cannot take those tags.
6. **Team** — operator user list (no create-user API while sign-up is off).
7. **Campaigns / People / Templates / Automations / Status updates** — pages render.

## 3. Manual / live (not in CI)

- Publish `_relay-verify`, SPF, DKIM, DMARC on a real domain and use Check DNS.
- Send through SMTP and confirm `messageId` in the provider.
- CASL/CAN-SPAM/GDPR: marketing enqueue vs unsubscribe (engine unit tests cover the rules; live send needs a verified domain).

## Package cases (already implemented)

- **Compliance:** US opt-out, CA 730-day implied purchase, EU/UK express opt-in, physical address, unsubscribe always blocks.
- **Audience:** consent + recipient dedupe.
- **SMTP provider:** maps to `sendMail`; errors without `messageId`.
- **Domain:** chunked TXT ownership, PEM → DKIM `p=`, Hostinger-style hosts.
- **Outbox:** 6 attempts, 1m→1h backoff (`drain.test.ts`).
- **SDK:** Bearer POST `/v1/messages`.
