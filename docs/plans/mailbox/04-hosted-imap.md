# Plan 4 — Hosted IMAP (people domain)

**Depends on:** Plan 3 green (Relay Mailbox is already a product).  
**Out of scope:** IMAP inside Next.js; `@foundry/mail-host` until you have more than a handful of boxes; MX on the **transactional sending** domain.

## Goal

`vishwas@mail.tiffingrab.ca` (or another **people** hostname) works in Mail.app. Relay does not become the IMAP server.

Postgres Mailbox (Plans 1–3) remains source of truth for **operator conversations**. The IMAP host is source of truth for **that person’s inbox**. Do not dual-write the same letter into both without an explicit sync design (deferred).

## Work (only if Mail.app is required)

1. Choose people hostname ≠ receipt From domain.
2. **Buy** hosted mail (Fastmail / Workspace / Migadu) **or** one public Stalwart VM (PTR, 25, 993). Local `a6n-ai/mail` compose is a lab only.
3. Create accounts by hand until volume hurts.
4. Optional later: `@foundry/mail-host` + operator “Mailboxes” for the people domain only; DNS copy MX/SRV next to existing TXT with purpose “Mail for this domain”.

## Required tests

**Unit (when a client package exists)**

- Mock JMAP/HTTP: `ensureDomain`, `createAccount`, `disableAccount`.
- `dnsHints(domain)` returns MX/SRV hosts; **never** the SES sending hostname in tests.
- Invalid email / quota rejected.

**Contract**

- OpenAPI or typed fixtures for error payloads (401, 409 exists).
- No live Stalwart in CI (no network).

**Relay (if UI exists)**

- Creating an address on a sending-only domain is **rejected** (unit test on the rule).
- Operator UI has no word Stalwart/IMAP.

**Manual / staging (not CI)**

- Checklist: Mail.app IMAPS to staging host, send from Gmail, message appears in Mail.app.
- PTR and TLS documented; backup of mail store.

**Regression**

- Track A tests still green. Sending SPF/DKIM tests (`domain.test.ts`) unchanged.

## Done when

A real client can IMAP to the people host, and CI still never depends on port 25. Relay Mailbox (Plans 1–3) keeps working if Track B is down.
