# Contributing

## Checks

```bash
pnpm install
pnpm typecheck
pnpm test
```

Local Postgres, seed, and UI smoke: [`TESTING.md`](TESTING.md). Product facts for this repo: [`AGENTS.md`](AGENTS.md). Sequenced mailbox work: [`docs/plans/mailbox/README.md`](docs/plans/mailbox/README.md).

## Pull requests

- Target `main`.
- Do not commit `.env.local`, API secrets, or `.cursor/`.
- Operator UI copy stays non-technical (Home, Apps, Mailbox, Tags, Team). Routes and schema may still say tenant, outbox, SMTP.
- Keep Geist and purple accent. Do not restyle dark theme when changing light.
- Public HTTP surface is [`apps/relay/lib/v1/openapi.ts`](apps/relay/lib/v1/openapi.ts). If you add a route integrators should call, add it there so Scalar and Swagger stay true.

## Auth split

- `POST /v1/messages` — hashed app keys (`api_keys`).
- `/api/notifications/*` — operator session cookie.
