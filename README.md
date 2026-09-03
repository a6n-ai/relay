# Relay

Sends email (and later SMS / WhatsApp) for other products, and gives operators a console for apps, campaigns, people, mailbox, tags, and team.

Consuming products talk to Relay with API keys. They do not share Relay operator logins.

## Run locally

Needs Node, pnpm 11, and Postgres 16 (`compose.yaml` or any matching `DATABASE_URL`).

```bash
docker compose up -d
cp apps/relay/.env.example apps/relay/.env.local
# Set BETTER_AUTH_SECRET to a long random string
pnpm install
pnpm --filter relay db:migrate
SEED_ADMIN_PASSWORD=dev pnpm --filter relay db:seed
pnpm dev
```

Open [http://localhost:3010](http://localhost:3010). Unauthenticated visits go to `/login`. Sign-up is off; use the seed operator (`ops@relay.local` unless `SEED_ADMIN_EMAIL` is set). Seed prints one-time app secrets once. Copy them; they are not stored in plaintext.

Drain the outbox in a second terminal:

```bash
pnpm --filter relay worker:drain
```

Checks: `pnpm typecheck` and `pnpm test`. Local stack notes and UI smoke: [`TESTING.md`](TESTING.md). Production (EC2 + GHCR, same pattern as Realm): [`deployment/prod/RUNBOOK.md`](deployment/prod/RUNBOOK.md).

## HTTP APIs

Live catalog after `pnpm dev`:

- Docs: [http://localhost:3010/docs](http://localhost:3010/docs)
- Scalar: [http://localhost:3010/docs/api](http://localhost:3010/docs/api)
- Swagger UI: [http://localhost:3010/docs/api/swagger](http://localhost:3010/docs/api/swagger)
- OpenAPI: [http://localhost:3010/v1/openapi.json](http://localhost:3010/v1/openapi.json)

**App key (Bearer)** for `POST /v1/messages`. Mint the secret when you create an app in the console (or via session `POST /api/notifications/apps`). Put it in the consuming app as `RELAY_API_KEY` and the origin as `RELAY_API_URL`.

```bash
curl -sS -D - \
  -H "Authorization: Bearer $RELAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello","body":"World","to":{"email":"dev@example.com"}}' \
  http://localhost:3010/v1/messages
```

Expect `202` and `{ "accepted": true }`. Missing key is `401`.

**Operator session cookie** (`better-auth.session_token`) for console JSON: apps, mailbox, campaigns, people lists, automations, tags, team, templates, status updates. Sign in at `/login`, then call those routes from the same browser or with the cookie. Language SDKs besides `@relay/sdk` (`messages.create`) are not generated yet; use the OpenAPI document.

## Operator console

Sidebar jobs (not protocol names): Home, Apps, Campaigns, People, Templates, Automations, Sends, Mailbox, Status updates, Email sending, Tags, Team.

| Job | What it is |
| --- | --- |
| Apps | Consuming products: quota, channel keys, verified send-as |
| Mailbox | Conversations in Postgres (sent + received). Reply stays on the thread |
| Tags | Per-app labels; every message from that app carries them. Mailbox chips reuse them |
| Email sending | Transport, From, and domains (Settings) |
| Team | Operator users (list). Sign-up stays disabled |

Inbound mail is a signed provider webhook, not a port-25 listener. Hosted `you@domain` IMAP is not in this Next.js app.

## Send path

1. Save transport under **Email sending** (SMTP or SES via `EMAIL_TRANSPORT` and env in `.env.example`).
2. Verify the From domain (ownership TXT `_relay-verify`, SPF, DKIM, DMARC).
3. Create an **app**, copy the key, send with `POST /v1/messages`.
4. Each app has a mailing country. CA uses CASL, US CAN-SPAM, EU/UK default to express opt-in. Campaigns use that profile.

Queue is Postgres `notification_outbox` (`SKIP LOCKED`, six attempts, 1m→1h backoff). No Redis or RabbitMQ.

## Packages

| Package | Role |
| --- | --- |
| `apps/relay` | Next.js operator app (port 3010) |
| `@relay/engine` | Outbox, drain, policy, campaigns, suppression |
| `@relay/email` | Email adapters (SES or SMTP) |
| `@relay/sms` / `@relay/whatsapp` | Channel adapters |
| `@relay/sdk` | HTTP client for send |
| `@relay/ui` | Composer / logs / bell (re-exports engine UI) |

`@foundry/*` packages are pulled from Git as TypeScript source and stay in Next `transpilePackages`.

## Layout

```
apps/relay/          operator app, migrations, public /docs
packages/engine/     outbox and campaigns
packages/email/      SES / SMTP
packages/sdk/        send client
docs/plans/mailbox/  sequenced mailbox plans
```

Do not commit `.env.local` or `.cursor/`.

## License

GNU Affero General Public License v3.0. See [`LICENSE`](LICENSE). That is an OSI license GitHub detects (`agpl-3.0`).

`@foundry/*` stays [Apache 2.0](https://github.com/a6n-ai/foundry). Those files are not relicensed; the Relay application as shipped is AGPL. Realm is AGPL as well.
