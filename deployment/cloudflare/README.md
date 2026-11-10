# Relay on Cloudflare Workers

Worker `relay` (OpenNext) at `https://relay.a6n.ai`, Cloudflare account `04244aeac63353bc0ecc1ee64058cd82`.

## Resources

| Where | Resource | Id / name |
|---|---|---|
| Neon (org a6n) | project `relay`, `aws-ap-southeast-1`, role `relay_app`, DB `relay` | `flat-mud-70723399` |
| Cloudflare | Hyperdrive `relay-prod` (caching disabled) → Neon direct endpoint | `d3aaf35d88c14dfc9578f0dbb94a9154` |
| Cloudflare | Queues `relay-outbox`, `relay-outbox-dlq` | |
| Cloudflare | KV `relay-cache` (bootstrap marker) | `be4ce70d6b8a4bac8c958a1a213b7a5f` |
| Cloudflare | Workflow `relay-wake` (created by deploy) | |
| AWS ap-south-1 | stack `relay-ses` (`ses.yaml`): identities `relay.a6n.ai`, `a6n.ai`, config set `relay-prod`, SNS `relay-ses-events` | |
| AWS ap-south-1 | stack `relay-workers-iam` (`worker-iam.yaml`): IAM user `relay-workers`, key in Secrets Manager `/relay/workers/aws-access-key` | |

SES in `ap-south-1` starts in the sandbox (200/day, verified recipients only) until production access is granted.

## DNS (zone a6n.ai)

| Type | Name | Value |
|---|---|---|
| CNAME | `g2mlzmh5m6u4ypexqmliplh5d76sqgtf._domainkey.relay` | `g2mlzmh5m6u4ypexqmliplh5d76sqgtf.dkim.amazonses.com` |
| CNAME | `trsl7imcgbklmk7s5n6amp6l74drppog._domainkey.relay` | `trsl7imcgbklmk7s5n6amp6l74drppog.dkim.amazonses.com` |
| CNAME | `estxo5vw34x6rzp3c2sfeukz7rhho46d._domainkey.relay` | `estxo5vw34x6rzp3c2sfeukz7rhho46d.dkim.amazonses.com` |
| MX 10 | `mail.relay` | `feedback-smtp.ap-south-1.amazonses.com` |
| TXT | `mail.relay` | `v=spf1 include:amazonses.com ~all` |
| TXT | `_dmarc.relay` | `v=DMARC1; p=none` |
| CNAME | `huvfu7el2o5fopxmgkiipmv3sp27y6ej._domainkey` | `huvfu7el2o5fopxmgkiipmv3sp27y6ej.dkim.amazonses.com` |
| CNAME | `oazkzn4xm62gcfuf4ycsuu4kasdfbb2i._domainkey` | `oazkzn4xm62gcfuf4ycsuu4kasdfbb2i.dkim.amazonses.com` |
| CNAME | `7jpmb2qf5zcb7j6b2ny2uzjwymjupdw4._domainkey` | `7jpmb2qf5zcb7j6b2ny2uzjwymjupdw4.dkim.amazonses.com` |
| MX 10 | `mail` | `feedback-smtp.ap-south-1.amazonses.com` |
| TXT | `mail` | `v=spf1 include:amazonses.com ~all` |

CNAMEs are DNS only (grey cloud). `_dmarc.a6n.ai` already exists (`p=none`). The apex MX stays on Cloudflare Email Routing; it receives Relay mailbox mail.

Check: `aws sesv2 get-email-identity --region ap-south-1 --email-identity relay.a6n.ai --query '[VerificationStatus,DkimAttributes.Status,MailFromAttributes.MailFromDomainStatus]'`.

## Migrate and seed

```bash
DIRECT_DATABASE_URL='<neon direct url>' pnpm --filter relay db:migrate
DIRECT_DATABASE_URL='<neon direct url>' SEED_ADMIN_EMAIL='<operator email>' SEED_ADMIN_PASSWORD='<once>' pnpm --filter relay db:seed
```

## Build locally

`pnpm cf:build` fails in a clone that sits next to `foundry/` (Turbopack root and the sibling `@source` lines). Build from a clean worktree outside `a6n-ai`, as CI does, with a dummy `DATABASE_URL` for page-data collection:

```bash
git worktree add /tmp/relay-wt HEAD && cd /tmp/relay-wt && pnpm install --frozen-lockfile
cd apps/relay && DATABASE_URL=postgres://build:build@127.0.0.1:1/build NEXT_PUBLIC_BETTER_AUTH_URL=https://relay.a6n.ai pnpm cf:build
```

`wrangler dev` rewrites Host and Origin to the `relay.a6n.ai` route, so `.dev.vars` needs `BETTER_AUTH_URL=http://relay.a6n.ai`.

## Secrets

`wrangler secret put` each of: `BETTER_AUTH_SECRET`, `CRON_SECRET`, `MAILBOX_INBOUND_SECRET`, `RELAY_UNSUBSCRIBE_SECRET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (from `/relay/workers/aws-access-key`).
