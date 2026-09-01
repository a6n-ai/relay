## Learned User Preferences

- Treat Relay as its own notification product: Geist Sans and Geist Mono everywhere; never TiffinGrab orange/cream.
- Purple is the only chromatic accent (not Meta/Facebook blue). Light theme has no navy and uses a purple sidebar.
- Dark theme stays black/graphite (Stripe-like). Do not restyle dark when changing light.
- Lyra visual language: sharp rectangles (no rounded corners), dotted field background, hairline gutters. Product-card KPIs are one card with hairline columns, not separate tiles.
- Shadcn Dashboard blocks (shadcndashboard.dev) are visual/layout reference only. Implement with Foundry primitives plus Relay DS; do not vendor dumped `components/ui` or ecommerce dummy blocks as the source of truth.
- Do not push `.cursor/` MCP/AI config to GitHub.
- Use semantic design tokens (`bg-primary`, etc.), not raw color utilities.

## Learned Workspace Facts

- Relay is a Next.js operator console for multi-channel notifications at `http://localhost:3010` (`/` → `/dashboard`, unauthenticated → `/login`). Better Auth sign-up is disabled; the seed operator is the local login path.
- Data layer is Postgres + Drizzle. Local env lives in `apps/relay/.env.local` (gitignored).
- Turbopack root is `a6n-ai` (parent of this repo) so Tailwind can `@source` sibling Foundry packages. Git-hosted `@foundry/*` packages ship TypeScript source and must stay in `transpilePackages`.
- Pin `shadcn@4.11.0` so CSS (`shadcn/dist/tailwind.css`) resolves under that Turbopack root.
- Relay DS lives under `apps/relay/components/ds`; UI primitives come from `@foundry/ui`. `.cursor/` is gitignored.
