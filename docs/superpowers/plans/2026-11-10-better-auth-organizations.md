# Better Auth organizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Better Auth organizations so each client (and a6n) works in an org-scoped Relay console, with Infra `dash` for a6n org listing/analytics.

**Architecture:** Better Auth owns users, orgs, members, invites, and `activeOrganizationId`. Relay `tenants` (apps) gain `organization_id` and are listed only for the active org. Optional `@better-auth/infra` `dash()` when `BETTER_AUTH_API_KEY` is set.

**Tech Stack:** Better Auth 1.7.x, `@better-auth/infra` dash, Drizzle/Postgres, Next.js Relay app, Foundry SessionUpdatableService.

**Spec:** `docs/superpowers/specs/2026-11-10-better-auth-organizations-design.md`

## Global Constraints

- Sign-up remains disabled (`disableSignUp: true`).
- Operator UI stays non-technical (no “tenant”, “Better Auth”, “organizationId” in chrome copy — use “Workspace” / “Organization” / “Apps”).
- Do not push secrets; `BETTER_AUTH_API_KEY` only in env.
- Match existing Drizzle ID style (`generateId: false`, text ids via `next_id()` where BA expects string ids).
- One Node-heavy command at a time on memory-limited Macs.

## Review Focus

- Session without active org must not leak all apps.
- Member of org A must not read org B apps.
- Seed/migration leaves existing local apps attached to a default org.
- `dash()` absent when no API key must not break login.

## File map

| File | Responsibility |
|------|----------------|
| `apps/relay/db/schema/organization.ts` | BA organization, member, invitation tables |
| `apps/relay/db/schema/auth.ts` | `session.activeOrganizationId` |
| `apps/relay/db/schema/tenants.ts` | `organizationId` on apps |
| `apps/relay/db/migrations/*` | SQL migration |
| `apps/relay/lib/auth/index.ts` | `organization()` + optional `dash()` |
| `apps/relay/lib/auth/client.ts` | `organizationClient` (+ dashClient if needed) |
| `apps/relay/lib/auth/active-org.ts` | Resolve active org id for server code |
| `apps/relay/lib/services/tenants.service.ts` | Scope list/create to active org |
| `apps/relay/components/...` | Org switcher + create org |
| `apps/relay/db/seed.ts` | Default org + membership + backfill apps |

## Tasks

### Task 1: Schema + migration

- [x] Add organization / member / invitation Drizzle tables (BA field names).
- [x] Add `session.active_organization_id`.
- [x] Add `tenants.organization_id` (text, nullable then backfilled; index).
- [x] Generate/apply migration; export from schema index.

### Task 2: Auth plugins

- [x] `organization({ allowUserToCreateOrganization: true })` on server.
- [x] Register org models in drizzleAdapter schema map.
- [x] Conditionally add `dash({ apiKey })` from `@better-auth/infra`.
- [x] Client: `organizationClient()`.
- [x] Smoke: auth config typechecks.

### Task 3: Active-org helpers + tenant scope

- [x] `requireActiveOrganizationId()` from session (throw/redirect if missing).
- [x] Tenants list/create filter + set `organizationId` on create.
- [x] Dashboard layout: if logged in with no active org, set first membership or redirect to org picker.

### Task 4: Operator chrome

- [x] Workspace switcher in sidebar/header (list orgs, set active).
- [x] Create organization dialog (name/slug → BA create + set active).
- [x] Copy: “Workspace”, not technical jargon.

### Task 5: Seed + docs

- [x] Seed creates org `a6n` (or `relay`), adds seed admin as owner, backfills apps.
- [x] Note Infra env vars in README or `.env.example` if present.
- [x] Brief AGENTS.md workspace fact: orgs via Better Auth; apps scoped to active org.

## Done when

- Login → active org → Apps list only shows that org’s apps.
- User can create a second org and switch; apps don’t cross-leak.
- With `BETTER_AUTH_API_KEY`, dash plugin loads (Infra can list orgs).
- Without the key, Relay still runs.
