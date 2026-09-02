# Plan 1 — Outbound Mailbox categories

**Depends on:** nothing (uses today’s `email_mailbox` outbound snapshot).  
**Unblocks:** Plan 2.  
**Out of scope:** inbound, IMAP, Stalwart, MX, `@foundry/mail-host`.

## Goal

Mailbox is the **letters** product: everything Relay sent, with chips so operators can hide noise.

| Chip | Meaning |
|---|---|
| All | Every letter |
| Relay sent | Direction out (all outbound; default once Received exists) |
| Automatic | Receipts, alerts, API/automation — `kind` transactional or no campaign |
| Campaigns | One-to-many send the operator confirmed |
| Failed | Linked outbox status failed |

Sends stays the delivery queue. Do not merge the two pages.

## Work

1. Add columns (migration + `makeTenantNotificationTables`):
   - `direction` `out` \| `in` (default `out`)
   - `origin` `automatic` \| `campaign` \| `test` (test-template send)
   - Keep existing html/text/from/to.
2. Set `origin` in `archiveMailboxLetter` / drain (campaignId set → campaign; else automatic; template test route → test).
3. Mailbox list: chips above; search still hits subject/from/to/app. Count `n of m`.
4. Empty vs no-match copy unchanged in tone.

## Required tests

**Unit (`packages/engine`)**

- Schema: `email_mailbox` includes `direction`, `origin`.
- `letterFilterKeys({ direction, origin, outboxStatus })` → expected chip ids. Table-driven: automatic+sent, campaign+failed, test send, missing outbox (treat as sent).
- Exhaustive `switch` on `origin` and `direction`.

**Unit (`apps/relay`)**

- Mapping from DB row → `ListingRow.filterKeys` (no React). Cases: all four origins × failed/not.
- Search haystack does not include HTML body (avoid huge strings / XSS in search).

**Integration**

- `archiveMailboxLetter` with a fake db or drizzle test if one exists; otherwise mock insert payload: campaign row sets `origin=campaign`, API-shaped row sets `automatic`.
- Template test route: after successful send, letter has `origin=test`, `direction=out`. Mock email provider (follow `smtp-provider.test.ts`).

**Regression**

- Existing engine tests still pass (93+). Drain still archives HTML.
- `pnpm --filter relay typecheck`.

**Browser (not CI; localhost:3010)**

- Mailbox with ≥2 letters: Automatic vs Campaigns hides the other set.
- Failed chip shows only failed.
- Search + chip together: no matches → “Nothing matches…”
- Empty DB: no chips required; empty message only.

## Done when

Operators can filter Mailbox without opening Sends, and the suites above are green.
