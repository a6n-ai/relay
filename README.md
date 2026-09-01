# Relay

Multi-channel notification product: operator app, own login, own Postgres, drain worker, engine + channels + SDK.

Other products (Realm, Monarch, Copper+Cloves) are **tenants with API keys** — they do not share Relay operator users.

Packages:

- `@relay/engine` — outbox, drain, policy, campaigns, suppression, country-based marketing compliance
- `@relay/email` / `@relay/sms` / `@relay/whatsapp` — channel adapters (SES **or** SMTP)
- `@relay/sdk` — HTTP client
- `@relay/ui` — composer / logs / bell (re-exports engine UI)

App: `apps/relay` (port 3010). `POST /v1/messages` with a tenant API key.

## Sending (Brevo-style)

1. **SMTP or SES** — Settings → SMTP, or `EMAIL_TRANSPORT=smtp` plus `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`. The SMTP password is not a tenant API key.
2. **Authenticate the From domain** — Dashboard → Domains. Publish ownership TXT (`_relay-verify`), SPF, DKIM, DMARC, then Check DNS. Gmail/Yahoo bulk senders need SPF+DKIM+DMARC.
3. **Tenant + API user** — Dashboard → Tenants (Foundry `UpdatableService` + session `created_by`). Seed (and the “Create Tiffin Grab + Puchkaman API keys” button) issues keys for Realm apps. Put the secret in the app as `RELAY_API_KEY` and the origin as `RELAY_API_URL`.
Operators sign in with the same Better Auth + `@foundry/auth-ui` pattern as Realm (email OTP or password, OTP reset, no self-signup).
4. **Country compliance** — each tenant has a mailing country. CA uses CASL (opt-in + 24-month implied consent from a purchase). US is CAN-SPAM (opt-out + physical address). EU/UK default to GDPR-style express opt-in. Campaign list resolution uses this profile.
5. **Lists, templates, retries** — contact lists and campaign templates already live in `@relay/engine` (used by Realm apps today). Outbox retries: 6 attempts, 1m→1h backoff (`notification_outbox.attempts` / `next_attempt_at`).

```bash
pnpm install
pnpm typecheck
pnpm test
```

Local Postgres, seed, API smoke, and the case catalog: [`TESTING.md`](TESTING.md).
This VM has no Docker/Postgres daemon; `compose.yaml` is for a machine that can run `docker compose up -d`.
