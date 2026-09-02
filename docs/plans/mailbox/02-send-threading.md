# Plan 2 — Send-side threading headers

**Depends on:** Plan 1 green.  
**Unblocks:** Plan 3.  
**Out of scope:** inbound HTTP, IMAP, receiving.

## Goal

Every outbound letter stores RFC **Message-ID** (and a stable `thread_id`) so a later reply can attach to the same conversation.

## Work

1. Columns: `rfc_message_id`, `in_reply_to`, `references` (text, nullable), `thread_id` (text, not null for new rows; outbound: `thread_id = rfc_message_id` once known).
2. After SMTP/SES send, persist provider `messageId` onto the mailbox row (update by `outbox_id`). If the provider returns no id, generate a Relay Message-ID and pass it on send if the transport allows custom headers; otherwise store a synthetic id and document the gap in a test skip.
3. Pure helpers in engine (no DB):
   - `normalizeMessageId`
   - `threadIdForOutbound({ rfcMessageId })`
   - `threadIdForInbound({ inReplyTo, references, fallback })` — implement now, use in Plan 3; **test now**.
4. Mailbox detail: show thread id only in a way that stays non-technical (omit from chrome, or “Conversation” without raw ids). Prefer no Message-ID in the UI.

## Required tests

**Unit — threading (`packages/engine`, table-driven fixtures)**

- `normalizeMessageId`: with/without angle brackets, whitespace.
- Outbound thread_id equals normalized Message-ID.
- Inbound: `In-Reply-To` hits parent; `References` walks to root; empty headers → new thread from own Message-ID; `Re:` subject is **not** used as the primary key (headers win).
- Malformed / missing headers do not throw.

**Unit — SMTP/SES**

- Existing `smtp-provider.test.ts` / `ses-provider.test.ts` still assert `messageId` on success.
- New: if we add a header `Message-ID`, it is passed through (or explicitly not — test the chosen behavior).

**Handler / archive**

- Mock `emailProvider.send` returning `{ providerMessageId: "<abc@relay.test>" }`.
- After handler, mailbox row has matching `rfc_message_id` and `thread_id`.
- Retry/onConflict update does not blank ids.

**Regression**

- Full engine + relay test + typecheck.
- Plan 1 filter tests still pass with new columns defaulted.

**Browser**

- Detail page still renders preview. No crash if `rfc_message_id` is null on old rows (backfill: leave null; UI must not assume present).

## Done when

New outbound letters have ids in Postgres, threading helpers are fully covered, old rows without ids do not break the UI.
