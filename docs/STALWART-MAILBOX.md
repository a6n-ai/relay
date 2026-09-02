# Mailbox — plan (council-revised)

Outbound archive in `email_mailbox` stays. This doc is the **revised** path after a four-voice council (architect, skeptic, pragmatist, critic). They agreed the original 7-step Stalwart sequence was one plan covering **three products**.

## Two tracks (do not merge)

| Track | Operator sees | How |
|---|---|---|
| **A — Conversations in Relay** | Mailbox threads (sent + replies) | Inbound webhook into Postgres. Reuse the send stack. No IMAP. |
| **B — People addresses in Mail.app** | `vishwas@…` works in Apple Mail | Real mail host (buy first, or one Stalwart VM later). **Never** on the transactional send domain. |

`@foundry/email` = send. Do **not** add `@foundry/mail-host` until a second app needs provisioning or you have more than a handful of boxes. The sibling `mail/` compose folder is an **optional lab**, not the critical path.

**Hard rule:** people mail MX ≠ SES/SMTP sending domain. Binding `vishwas@tiffingrab.ca` to the verified *sending* domain is a reputation bug, not a convenience.

**Source of truth:** one store per letter. Do not snapshot inbound in Postgres *and* keep the same letter as the IMAP source without a sync design. Track A’s store is Postgres. Track B’s store is the mail host. Relay UI may *read* B later via JMAP; it must not silently dual-write.

---

Implement **in order**, with tests required on each: [plans/mailbox/README.md](./plans/mailbox/README.md).

- Plan 1: outbound categories (Automatic / Campaigns / Relay sent / Failed)
- Plan 2: send-side Message-ID / thread_id
- Plan 3: inbound Received + attach to thread
- Plan 4: optional hosted IMAP on a **people** domain (not the send domain)


## Explicitly deferred

- 7-step “compose → Foundry client → MX copy → inbound → VM” as one sequence
- `@foundry/mail-host` before a second consumer
- Roundcube in Relay
- Catch-all on the sending domain
- Dual inbox (Stalwart store + Postgres copy) without a sync rule
