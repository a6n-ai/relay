# Relay as an email / notification platform

Queue decision: **keep Postgres transactional outbox** (`SKIP LOCKED` + backoff). Do **not** add RabbitMQ unless outbox throughput is the proven bottleneck.

## In Relay now

- App send API: `POST /v1/messages` (optional `sendAt`, `event`, channels)
- Public docs: `/docs`, Scalar `/docs/api`, Swagger `/docs/api/swagger`, `GET /v1/openapi.json`
- Operator JSON (session cookie): apps, mailbox, campaigns, people lists, automations, tags, team, templates, status updates
- Outbox + drain/retry, SES/SMTP, sending domains, SES bounce webhook
- Mailbox conversations in Postgres (reply stays on the thread; inbound is a signed webhook)
- App-scoped message tags (`/dashboard/settings/tags`; Mailbox chips)
- Campaigns + contact lists + CASL footer + `/unsubscribe`
- Per-app **templates** (`/dashboard/templates`)
- **Scheduled campaigns** (worker calls `dueCampaigns`)
- App **webhooks** (HMAC `X-Relay-Signature`, retry table)
- **List triggers** (API event → append to a contact list)
- SMS / WhatsApp drain via Twilio when env is set
- LISTEN/NOTIFY on `relay_work` plus interval poll (`pnpm --filter relay worker:drain`)

## Later

- Visual React Email editor (engine UI exists; Relay uses HTML/text for Lyra)
- Product-event **segments** (`resolveSegment` is still `[]`)
- RabbitMQ only after measuring outbox lag
- Full journey builder (waits, splits) — not a second broker
- Language SDKs generated from OpenAPI (beyond `@relay/sdk` send)
- Hosted people-mail IMAP: [plans/mailbox/README.md](./plans/mailbox/README.md) and [STALWART-MAILBOX.md](./STALWART-MAILBOX.md)
