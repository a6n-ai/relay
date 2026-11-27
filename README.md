# Relay

Sends email for other products and gives operators a console for workspaces, apps, campaigns, lists, templates, automations, messages and team.

Consuming products talk to Relay with API keys or a Cloudflare service binding. They do not share Relay operator logins.

## Run locally

Needs Node 22 and pnpm 11. Relay is one Cloudflare Worker (TanStack Start) with D1, a Durable Object per workspace, Queues, Workflows and R2; `vite dev` runs all of them locally.

```bash
pnpm install
cp apps/relay/.dev.vars.example apps/relay/.dev.vars   # fill in the secrets you need
pnpm --filter relay db:migrate:local
pnpm dev
```

Checks: `pnpm typecheck` and `pnpm test`. More in [`TESTING.md`](TESTING.md).

## Deploy

Push to `main` runs [`deploy-relay.yml`](.github/workflows/deploy-relay.yml): typecheck, test, build, D1 migrations, then `wrangler deploy` of the Worker `relay` at `https://relay.a6n.ai`. Set the repo variable `RELAY_DEPLOY` to `0` to pause deploys.

Operator jobs (seed, sweep) run through the `relay-ops` Workflow:

```bash
npx wrangler workflows trigger relay-ops '{"op":"sweep"}'
```

## Packages

| Package | Role |
| --- | --- |
| `apps/relay` | The Relay Worker: console, public API, send pipeline |
| `apps/relay-docs` | Public docs, served at `/docs` |
| `@relay/engine` | Shared email engine that TiffinGrab and Realm still import |
| `@relay/email` | Email adapters (SES or SMTP) |

`@foundry/*` packages are pulled from Git as TypeScript source.

Do not commit `.dev.vars`, `.env*` or `.cursor/`.

## License

GNU Affero General Public License v3.0. See [`LICENSE`](LICENSE). That is an OSI license GitHub detects (`agpl-3.0`).

`@foundry/*` stays [Apache 2.0](https://github.com/a6n-ai/foundry). Those files are not relicensed; the Relay application as shipped is AGPL. Realm is AGPL as well.
