# Relay as an email / notification platform

Queue decision: **keep Postgres transactional outbox** (`SKIP LOCKED` + backoff). Do **not** add RabbitMQ unless outbox throughput is the proven bottleneck.

## In Relay now

- Multi-tenant API: `POST /v1/messages` (optional `sendAt`, `event`, channels)
- Outbox + drain/retry, SES/SMTP, sending domains, SES bounce webhook
- Campaigns + contact lists + CASL footer + `/unsubscribe`
- Per-tenant **templates** (`/dashboard/templates`)
- **Scheduled campaigns** (worker calls `dueCampaigns`)
- Tenant **webhooks** (HMAC `X-Relay-Signature`, retry table)
- **List triggers** (API event → append to a contact list)
- SMS / WhatsApp drain via Twilio when env is set
- LISTEN/NOTIFY on `relay_work` plus interval poll (`pnpm --filter relay worker:drain`)

## Later

- Visual React Email editor (engine UI exists; Relay uses HTML/text for Lyra)
- Product-event **segments** (`resolveSegment` is still `[]`)
- RabbitMQ only after measuring outbox lag
- Full journey builder (waits, splits) — not a second broker
- Mailbox product: sequenced, tested plans in [plans/mailbox/README.md](./plans/mailbox/README.md)
