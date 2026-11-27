# Move current users to personal mailboxes (2026-11)

Reviewed SQL runbook. Not run by an agent. Run it only as the owner, or with the owner's go.

Needs the personal-mailbox migrations deployed on both D1 databases (`user.recovery_email`, `address.kind = 'personal'`, `address.owner_user_id`).

Run these from `apps/relay`. Do every user in turn: precheck, then relay-security, then relay-core, then the check.

## Placeholders

| Placeholder | Value |
| --- | --- |
| `<USER_ID>` | `user.id` of the person (relay-security) |
| `<MAILBOX>` | the new address, lower case, on a verified domain of the workspace |
| `<WORKSPACE_ID>` | the workspace the mailbox belongs to |
| `<APP_ID>` | an app in that workspace |
| `<NAME>` | display name |

## 1. Precheck: the mailbox is free

Both queries must return `0`.

```sh
wrangler d1 execute relay-core --remote --command "SELECT count(*) AS taken FROM address WHERE email = '<MAILBOX>';"
wrangler d1 execute relay-security --remote --command "SELECT count(*) AS taken FROM user WHERE email = '<MAILBOX>';"
```

Also confirm no invitation is pending for the mailbox (expect `0`), the user is a member of `<WORKSPACE_ID>` (expect one row), and `<APP_ID>` belongs to the workspace (expect one row):

```sh
wrangler d1 execute relay-security --remote --command "SELECT count(*) AS pending FROM invitation WHERE email = '<MAILBOX>' AND status = 'pending';"
wrangler d1 execute relay-security --remote --command "SELECT role FROM member WHERE user_id = '<USER_ID>' AND organization_id = '<WORKSPACE_ID>';"
wrangler d1 execute relay-security --remote --command "SELECT id FROM app WHERE id = '<APP_ID>' AND workspace_id = '<WORKSPACE_ID>';"
```

Confirm the domain is verified (expect one row with `status = verified`):

```sh
wrangler d1 execute relay-core --remote --command "SELECT domain, status FROM sending_domain WHERE workspace_id = '<WORKSPACE_ID>' AND domain = substr('<MAILBOX>', instr('<MAILBOX>', '@') + 1);"
```

## 2. relay-security: the old email becomes the recovery email

The mailbox becomes the sign-in. Sign-in codes go to the recovery email. The password and sessions stay.

```sh
wrangler d1 execute relay-security --remote --command "UPDATE user SET recovery_email = email, email = '<MAILBOX>' WHERE id = '<USER_ID>';"
```

## 3. relay-core: the personal address

Double any single quote in `<NAME>`. The id is 12 hex characters, the same length as `newId`.

```sh
wrangler d1 execute relay-core --remote --command "INSERT INTO address (id, workspace_id, app_id, email, kind, display_name, can_send, owner_user_id, created_at, updated_at) VALUES ('adr_' || lower(hex(randomblob(6))), '<WORKSPACE_ID>', '<APP_ID>', '<MAILBOX>', 'personal', '<NAME>', 1, '<USER_ID>', unixepoch() * 1000, unixepoch() * 1000);"
```

If step 3 fails, undo step 2 with `UPDATE user SET email = recovery_email, recovery_email = NULL WHERE id = '<USER_ID>';`.

## 4. Check (read-only)

```sh
wrangler d1 execute relay-security --remote --command "SELECT id, email, recovery_email FROM user WHERE id = '<USER_ID>';"
wrangler d1 execute relay-core --remote --command "SELECT id, email, kind, can_send, owner_user_id FROM address WHERE email = '<MAILBOX>';"
```

Expect one row each: the user has `email = <MAILBOX>` and the old address in `recovery_email`; the address has `kind = personal`, `can_send = 1`, `owner_user_id = <USER_ID>`.

Then sign in with the mailbox and the existing password. A code sent to the mailbox goes to the recovery email.

Use `--local` in place of `--remote` to rehearse after `pnpm db:migrate:local` on a seeded user.
