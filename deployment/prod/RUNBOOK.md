# Production deploy

Same shape as Realm: **GitHub Actions builds images → GHCR → EC2 pulls**. The box does not compile Next. Config is **SSM Parameter Store** (`/relay/prod/*`), not a hand-edited env file. Caddy is the public ingress.

Relay has **no Redis or RabbitMQ**. The queue is Postgres `notification_outbox`. The drain worker must use `DIRECT_DATABASE_URL` because PgBouncer transaction mode cannot `LISTEN` on `relay_work`.

## Layout

```
deployment/prod/
  Dockerfile                 web (runner) + tools (build) from APP=relay
  relay/deploy.sh            SSM → .env.production, migrate, compose up
  relay/docker-compose.yml   web + worker + pgbouncer
  proxy/                     Caddy on the `edge` network
```

Images: `ghcr.io/a6n-ai/relay-web` (standalone runner), `ghcr.io/a6n-ai/relay-tools` (`tools` stage: install + migrate/drain, Next cache stripped). Pin with `IMAGE_TAG=<sha>`.

## First box

1. EC2 with Docker, git, jq, awscli. Instance role: `ssm:GetParametersByPath` on `/relay/prod`, CloudWatch logs, SES (and no extra S3 unless you add file storage later).
2. RDS Postgres in the same VPC, DB `relay`.
3. DNS A record → Elastic IP. Caddy issues TLS once 80/443 resolve.
4. Make GHCR packages **public** (or put a `read:packages` token on the box).
5. Clone and start:

```bash
git clone https://github.com/a6n-ai/relay.git ~/relay
cd ~/relay/deployment/prod
docker network create edge
cp proxy/.env.production.example proxy/.env.production
# set ACME_EMAIL and RELAY_DOMAIN
```

6. Put parameters under `/relay/prod/` (see `relay/.env.production.example`). Hex RDS passwords avoid URL-encoding.
7. `cd ~/relay/deployment/prod/relay && ./deploy.sh`

Seed the operator once from the tools image (not on every deploy):

```bash
docker compose --profile tools run --rm \
  -e SEED_ADMIN_PASSWORD='your-once-password' \
  --entrypoint pnpm \
  migrate --filter relay db:seed
```

Do not keep the seed password in SSM after the first operator exists.

## CI

Push to `main` builds both images. SSH deploy runs only when repo variable `ENABLE_SSH_DEPLOY=true`.

Secrets: `EC2_HOST_RELAY`, `EC2_USER`, `EC2_SSH_KEY`. Optional variable `DEPLOY_PATH` (default `~/relay`).

Manual on the box: `cd ~/relay/deployment/prod/relay && ./deploy.sh`. Rollback: `IMAGE_TAG=<sha> ./deploy.sh`.

## Proxy env

`proxy/.env.production` is a real file on the box (`ACME_EMAIL`, `RELAY_DOMAIN`), not SSM. Mount `proxy/conf/` as a directory so `caddy reload` sees `git pull` edits.
