# Mailbox plans (implement in order)

Do **not** start a later plan until the previous plan’s **Done when** and **Required tests** are green.

| Order | Plan | Operator result |
|---|---|---|
| 1 | [01-outbound-categories.md](./01-outbound-categories.md) | One Mailbox; filter Automatic / Campaigns / Relay sent / Failed |
| 2 | [02-send-threading.md](./02-send-threading.md) | Letters carry RFC ids so replies can join a thread |
| 3 | [03-inbound-received.md](./03-inbound-received.md) | Received chip; reply sits on the same thread |
| 4 | [04-hosted-imap.md](./04-hosted-imap.md) | Optional: `name@people-domain` in Mail.app |

Council index: [../STALWART-MAILBOX.md](../STALWART-MAILBOX.md).

**Always:** `pnpm --filter @relay/engine test`, `pnpm --filter relay test`, `pnpm --filter relay typecheck` after each plan. No secrets in fixtures. Operator chrome: Mailbox, Automatic, Campaigns, Received — never SMTP, IMAP, webhook, outbox, tenant, Foundry.
