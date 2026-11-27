# Contributing

## Checks

```bash
pnpm install
pnpm typecheck
pnpm test
```

Local app and manual checks: [`TESTING.md`](TESTING.md). Product facts for this repo: [`AGENTS.md`](AGENTS.md). UI rules: [`DESIGN.md`](DESIGN.md).

## Pull requests

- Target `main`.
- Do not commit `.dev.vars`, `.env*`, API secrets, or `.cursor/`.
- Operator UI copy stays non-technical. Routes and schema may still say outbox, SMTP.
- A schema change ships with its D1 migration (`pnpm --filter relay db:generate:core` or `db:generate:security`).
- If you add or change a route integrators call, update its page in `apps/relay-docs`.

## License

This repository is AGPL-3.0. Pull requests are accepted under the same license. `@foundry/*` remains Apache 2.0 in [a6n-ai/foundry](https://github.com/a6n-ai/foundry).
