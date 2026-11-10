## Learned User Preferences

- Treat Relay as its own notification product: Apple-style design (owner, 2026-11-10). System font first (SF Pro on Apple devices, Geist as fallback), Geist Mono for code; never TiffinGrab orange/cream.
- One chromatic accent: Apple web blue `#0071e3` (dark mode fills stay `#0071e3`, `#0a84ff` for rings). Light canvas `#f5f5f7`, white cards, `#1d1d1f` ink. Every text/background pair clears 4.5:1.
- Dark theme: black canvas, `#1c1c1e` cards, blue only on actions.
- Apple colours and materials on Lyra shapes (owner, 2026-11-10): sharp rectangles (`--radius: 0px`), the dotted field on the dashboard canvas and dotted bands between rows, solid content cards, translucent blurred chrome (sidebar, top bar, menus, sheets, dialogs) with a `prefers-reduced-transparency` solid fallback. No page cross-fade: routes swap at once and `loading.tsx` skeletons carry the wait. Radix primitives via `@foundry/ui` stay; restyle through tokens and `app/globals.css`, not Foundry.
- Shadcn Dashboard blocks (shadcndashboard.dev) are visual/layout reference only (including Dashboard Shell 03 analytics). Implement with Foundry primitives plus Relay DS; do not vendor dumped `components/ui` or ecommerce dummy blocks as the source of truth.
- Do not push `.cursor/` MCP/AI config to GitHub.
- Use semantic design tokens (`bg-primary`, etc.), not raw color utilities.
- Use Foundry data-access (`UpdatableRepository`, `SessionUpdatableService`) and `@foundry/routes` for operator CRUD, not ad-hoc Drizzle on those paths.
- Tenants are consuming apps: monthly send quota, channel-scoped API tokens, and verified tenant senders (unverified From falls back to operator). A tenant domain can mint send-as addresses or Relay inboxes; people IMAP inboxes stay a later roster. Email first; operator SMTP/domains/From live in Settings.
- Operator chrome must stay non-technical. The sidebar is 8 grouped links (components/ds/nav.ts): Home, Inbox; Reach people: Campaigns, People; Activity: Sends; Setup: Apps, Channels, Settings. Templates/Automations, Status updates, the four channels, and Email sending/Tags/Team are tabs (SectionTabs) inside those. Keep it at 8 or fewer. Never SMTP, IMAP, webhook, outbox, tenant, POST /v1, Foundry, or skip locked in the UI. Routes and schema keep those names.
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
