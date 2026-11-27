## Learned User Preferences

- Relay follows `DESIGN.md` at the repo root (Vercel style, owner 2026-11-26; it replaced Linear). Read it before any UI change; it beats every older note here. Never TiffinGrab orange/cream.
- Monochrome. Primary is foreground on background; colour carries meaning only (blue link and focus ring, green success, amber warning, red destructive). No accent hue. Geist Sans and Geist Mono.
- Controls and cards are 6px, popups and modals 12px, badges are pills. Buttons use the Foundry default size (no `size="sm"`): one primary per view placed last, outline secondary, ghost tertiary, destructive only in the confirm dialog and the footer button of `DangerCard`, which opens it. Labels are a verb plus a noun.
- Do not push `.cursor/` MCP/AI config to GitHub.
- Use semantic design tokens (`bg-primary`, etc.), not raw color utilities, and no per-page colour or radius classes.
- Reuse first: build screens from `apps/relay/src/components/`, `@foundry/ui` and the semantic tokens. A pattern used twice becomes a component; no one-off class strings on pages.
- Operator copy stays non-technical. Never SMTP, IMAP, outbox or Durable Object in the UI; routes and schema keep those names.

## Learned Workspace Facts

- Relay is one Cloudflare Worker named `relay` (`apps/relay`, TanStack Start) at `https://relay.a6n.ai`. Central D1 `relay-security` (Better Auth) and `relay-core` (workspaces, apps, domains, addresses); one SQLite Durable Object `ClientDO` per workspace holds its messages, lists, campaigns, templates and suppressions.
- Queues: `relay-send`, `relay-ses-events`, `relay-inbound-mail`, `relay-webhooks`, each with a DLQ. Workflows: `relay-campaign`, `relay-ops` (seed, sweep). R2 `relay-mail` holds raw mail and attachments.
- Platform role `admin` is the super admin (all workspaces). Workspace roles: owner, admin, member, billing.
- TiffinGrab reaches Relay through the service binding `RELAY` (`RelayRpc`); Relay reads TiffinGrab audiences through `TIFFIN_AUDIENCE`.
- On memory-limited Macs, run only one Node-heavy command at a time with `NODE_OPTIONS=--max-old-space-size=4096`; never run a build next to `vite dev` or other heavy Node.
