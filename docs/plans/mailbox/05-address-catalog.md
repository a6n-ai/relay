# Plan 5 — Address catalog (send-as + inboxes)

**Depends on:** Plans 1–4 green. Compose already sends from verified Froms.  
**Out of scope:** IMAP in Next.js; dual-write; provisioning a live people host.

## Goal

An app with a proven domain can mint **addresses** the way Google Admin adds users: local-part + domain + a seat on a quota. Each address has **one kind** and therefore **one store**.

| Kind | Operator label | Store | Also a From? |
|---|---|---|---|
| `send_as` | Send as | none (outbound snapshot only) | Yes |
| `relay_inbox` | Relay inbox | Postgres Mailbox | Yes, if the sending domain is ready |
| `people_inbox` | People inbox | People host (later) | No |

People inbox is **rejected** on a sending domain.

## Work

1. `mailbox_seat_quota` on the app (0 = unlimited). Count `tenant_mailboxes` rows.
2. `tenant_mailboxes`: local, domain, email, kind. Unique (tenant, email).
3. Create form on the app page. Default kind from `defaultKindForNewMailbox`.
4. Send as / Relay inbox require a **ready** sending domain and create a From identity.
5. People inbox records the address only; host provision stays Plan 4.

## Required tests

- Seat full → reject.
- `hello@` sending domain → people_inbox reject.
- `receipts@` ready domain → send_as + create From.
- `support@` ready domain → relay_inbox, store postgres.
- Operator chrome: Addresses, Send as, Relay inbox, People inbox — never SMTP/IMAP/webhook.

## Done when

App page lists addresses; creating one respects kind/store; `pnpm --filter relay test` and typecheck green.
