# Plan 3 — Inbound (Received) and threads

**Depends on:** Plan 2 green.  
**Unblocks:** Plan 4 (optional).  
**Out of scope:** IMAP, Stalwart accounts, MX on the transactional From domain, Apple Mail.

## Goal

Mailbox shows **Received** letters. A reply to a Relay send lands on the **same thread**. Operators filter Received vs Relay sent vs Automatic vs Campaigns.

Inbound arrives through the **existing send provider** (SES inbound, Mailgun route, or Cloudflare Email Routing) → signed HTTP POST. Not port 25 on the laptop.

## Work

1. Signed route, e.g. `POST /api/internal/mailbox/inbound` (or SES receiver next to existing bounce webhook). HMAC like tenant webhooks (`sign.test.ts` pattern).
2. Parse: from, to, subject, html, text, `Message-ID`, `In-Reply-To`, `References`. Store `direction=in`. Match `thread_id` via Plan 2 helpers. Match app by **To** local-part@domain only if we have an address book; until Plan 4, match by recipient of a prior outbound thread, else `tenant_id` null + still listable.
3. Chip **Received** (`direction=in`). Combine with other chips only where it makes sense (Received ∩ Failed is empty).
4. Reject: bad signature, empty body, payload over a documented max size, missing From/To.
5. Operator chrome: “Received”, never webhook/SNS.

## Required tests

**Unit — parser**

- Fixtures under `packages/engine/src/mailbox/fixtures/` (`.eml` or JSON): simple reply, HTML+text, missing html, encoded subject, angle-bracket ids.
- Parser never executes HTML; it only stores strings.
- Size cap: over-limit → typed error.

**Unit — auth**

- Valid HMAC accepts; wrong secret / truncated body / replay of different body rejects.
- Timing-safe compare (same as webhook sign tests).

**Unit — thread attach**

- Inbound `In-Reply-To` = outbound `rfc_message_id` → same `thread_id`.
- Unknown reply → new `thread_id` (own Message-ID).
- Duplicate inbound Message-ID → idempotent (unique index, second insert no-ops or updates same row).

**Route / integration**

- Handler tests with mocked db: 401/403 unsigned, 200 signed fixture, 413 oversized.
- SES/SNS shape: if we wrap SNS, test `SubscribeURL` is **not** auto-fetched in tests (no network); confirm we only handle `Notification`.

**Regression**

- Bounce/complaint SES tests (`ses-events.test.ts`) still pass; inbound route is separate.
- Plan 1–2 tests green. Typecheck.

**Browser**

- Seed or POST a signed fixture (local secret from env, not committed). Received chip shows the letter. Opening a thread that has out+in shows both (list or detail — pick one UX and test both empty Received and mixed thread).
- Automatic / Campaigns still hide inbound unless All.

**Not in CI**

- Live Gmail round-trip. Document a manual checklist: send from Relay, reply, drain inbound, see thread.

## Done when

A fixture reply attaches to a fixture send in tests, and a local signed POST appears under Received in the UI.
