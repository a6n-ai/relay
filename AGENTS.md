## Learned User Preferences

- Treat Relay as its own notification product: Geist Sans and Geist Mono everywhere; never TiffinGrab orange/cream.
- Purple is the only chromatic accent (not Meta/Facebook blue). Light theme has no navy and uses a purple sidebar.
- Dark theme stays black/graphite (Stripe-like). Do not restyle dark when changing light.
- Lyra visual language: sharp rectangles (no rounded corners), dotted field background, hairline gutters. Product-card KPIs are one card with hairline columns, not separate tiles.
- Shadcn Dashboard blocks (shadcndashboard.dev) are visual/layout reference only (including Dashboard Shell 03 analytics). Implement with Foundry primitives plus Relay DS; do not vendor dumped `components/ui` or ecommerce dummy blocks as the source of truth.
- Do not push `.cursor/` MCP/AI config to GitHub.
- Use semantic design tokens (`bg-primary`, etc.), not raw color utilities.
- Use Foundry data-access (`UpdatableRepository`, `SessionUpdatableService`) and `@foundry/routes` for operator CRUD, not ad-hoc Drizzle on those paths.
- Tenants are consuming apps: monthly send quota, channel-scoped API tokens, and verified tenant senders (unverified From falls back to operator). A tenant domain can mint send-as addresses or Relay inboxes; people IMAP inboxes stay a later roster. Email first; operator SMTP/domains/From live in Settings.
- Operator chrome must stay non-technical: Home, Apps, Campaigns, People, Templates, Automations, Sends, Mailbox, Status updates, Email sending, Tags, Team. Group the sidebar by job; do not dump everything into Workspace. Never SMTP, IMAP, webhook, outbox, tenant, POST /v1, Foundry, or skip locked in the UI. Routes and schema keep those names.
- Operator listings share search plus filter chips (client-side over loaded rows). Empty catalogs stay a plain empty state until there is something to narrow.
- Collection pages use a shared create/browse split (`OperatorSplit`) and hairline resource rows, not per-page stacked cards.

## Learned Workspace Facts

- Relay is a Next.js operator console for multi-channel notifications at `http://localhost:3010` (`/` → `/dashboard`, unauthenticated → `/login`). Better Auth sign-up is disabled; the seed operator is the local login path.
- Data layer is Postgres + Drizzle. Local env lives in `apps/relay/.env.local` (gitignored).
- Turbopack root is `a6n-ai` (parent of this repo) so Tailwind can `@source` sibling Foundry packages. Git-hosted `@foundry/*` packages ship TypeScript source and must stay in `transpilePackages`.
- Pin `shadcn@4.11.0` so CSS (`shadcn/dist/tailwind.css`) resolves under that Turbopack root.
- Relay DS lives under `apps/relay/components/ds` (`OperatorSplit`, `ResourceBoard`/`ResourceRow`, listing search/filter); UI primitives come from `@foundry/ui`. `.cursor/` is gitignored.
- Queue is Postgres `notification_outbox` with SKIP LOCKED drain/retry (no Redis/RabbitMQ). Claim-and-process work and identity-less joins stay as explicit Drizzle transactions.
- Public send API is `POST /v1/messages` (hashed `api_keys`). Operator CRUD uses Foundry services; `campaign_tenant` is a Foundry entity (`ctn_` public ids).
- Operator email transport/From/domains live at `/dashboard/settings/email` (old `/dashboard/domains` and `/dashboard/sending` redirect). Tenant senders verify via domain DNS.
- Mailbox at `/dashboard/mailbox` is conversations in Postgres `email_mailbox` (sent + received), chip-filtered by origin (Relay sent / Automatic / Campaigns / Failed) and Received. Threads use Message-ID / In-Reply-To; Reply stays on the thread. Compose/Reply uses the send stack and verified Froms. Inbound is a signed provider webhook, not a port-25 listener. IMAP and hosted `you@domain` accounts are not in Next.js; Stalwart/Mail.app is optional later on a people domain. `@foundry/email` is send only — do not merge mailbox hosting into it, and do not put people-mail MX on the transactional sending domain.
- Message tags belong to an app and mark every message from that app (mail now, later channels later). Operators manage them at `/dashboard/settings/tags`; Mailbox chips reuse the same tags. Letters with no app cannot take those tags.
