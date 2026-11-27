# Testing Relay

Unit tests are the gate (`pnpm test`). DNS, SES and live mail stay manual.

## 1. Automated

```bash
pnpm install
pnpm typecheck
pnpm test
```

`apps/relay` tests run in the Workers runtime (`@cloudflare/vitest-plugin`), with D1, the per-workspace Durable Object, Queues and R2 provided by Miniflare. Packages cover the engine, email adapters, SMS keywords, WhatsApp session window and the HTTP SDK.

Run one area while you work:

```bash
pnpm --filter relay exec vitest run test/<file>.test.ts
```

## 2. Local app

```bash
cp apps/relay/.dev.vars.example apps/relay/.dev.vars
pnpm --filter relay db:migrate:local
pnpm dev
```

Sign-in is by emailed code. With `OTP_MAILER=memory` and `DEV_OTP_PEEK=1` (the example defaults), nothing is sent and `/api/dev/otp` shows the code to localhost requests only.

## 3. Manual / live (not in CI)

- Verify a real sending domain (DKIM, SPF, DMARC) and send through SES.
- Check SES events (delivery, bounce, complaint, open, click) reach Relay through SNS.
- Marketing sends: unsubscribe link and one-click `List-Unsubscribe` suppress the address.
