# Better Auth organizations + Infra dash (Relay)

**Status:** Approved 2026-11-10  
**Approach:** A — Org = customer workspace. **No Better Auth Infra / dash** — a6n platform client listing is a separate Relay surface later.

## Problem

Relay today is a flat operator console: one user pool (`role: admin`), sign-up disabled, every operator sees every app (`tenants`). a6n needs platform control over clients; clients need their own workspaces and the ability to create organizations; a6n must also be able to use Relay as a client.

## Decision

- **Identity / orgs / members / invites / active org / platform analytics listing:** Better Auth only (`organization` + existing `admin` + `@better-auth/infra` `dash`).
- **Product data (apps, sends, mailbox, campaigns):** Relay Postgres / Foundry, with each app (`tenants` row) linked to a Better Auth `organizationId`.
- Do **not** merge apps into org tables. Do **not** invent a parallel membership system.

## Model

| Concept | Owner | Notes |
|--------|--------|--------|
| User / session | Better Auth | Existing `users` / `session` |
| Organization | Better Auth | Client company (or a6n’s own org) |
| Member / invitation | Better Auth | Org roles: owner / admin / member (BA defaults) |
| Active org | `session.activeOrganizationId` | Scopes Relay console |
| Platform admin | BA `admin` plugin + Infra dash | a6n lists orgs, users, analytics |
| App (`tenants`) | Relay | `organization_id` text → BA organization id |
| API keys / outbox / mailbox | Relay | Unchanged, still under app |

## UX split

1. **Better Auth Infrastructure dashboard** (`dash`): a6n platform — org list/create, members, sign-in analytics, sessions, audit.
2. **Relay `/dashboard`**: product console for the **active organization** — apps, sends, inbox, etc. Org switcher + create organization for members who may create orgs.
3. Same login URL; after auth, user needs an active org (auto-select if one membership, else picker).

## Auth rules (v1)

- Public sign-up stays **disabled**.
- `allowUserToCreateOrganization: true` for authenticated users (clients create orgs; a6n can too).
- Platform operators keep `user.role = admin` (existing admin plugin).
- Console data access: only apps where `tenants.organization_id = session.activeOrganizationId` (platform admin may later use Impersonation / dash — v1 does not bypass org scope in Relay UI).

## Out of scope (v1)

- Better Auth Teams
- Nested orgs
- Self-serve public signup
- SCIM / SSO (can add later with Infra)
- Replacing Relay audit with Infra audit inside product pages

## Env

- Existing: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`
- Infra: `BETTER_AUTH_API_KEY` (and optional `BETTER_AUTH_API_URL` / `BETTER_AUTH_KV_URL` per Infra docs). `dash()` enabled when API key present so local/dev without Infra still boots.
