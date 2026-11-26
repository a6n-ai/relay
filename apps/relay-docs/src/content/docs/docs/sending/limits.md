---
title: Limits
description: The API rate limit, the monthly send quota and the size limits on a message.
---

## Rate limit

Each API key can make 600 requests in 60 seconds. Past that, the API answers `429` with `rate limited`. Wait and retry. One key's traffic does not use another key's budget.

## Monthly quota

Each workspace has a monthly send quota. The default is 10,000 messages. Your workspace may have a different number. A quota of 0 means no limit.

- The month is a UTC calendar month.
- Messages count when they are `queued` or `sent`. Suppressed and failed messages do not count.
- When you reach the quota, the API answers `429` with `quota_exceeded`. A running campaign pauses.
- The count starts over at the start of the next month.

To raise a quota, contact [support](/docs/help/support/).

## Message limits

- Up to 3 attachments per message, each up to 5 MB after decoding.
- Subjects cannot contain line breaks.
- Template `data` takes up to 10 keys, each value up to 200 characters.
- A list import takes up to 1,000 rows per request.
- A CSV import in the console takes a file up to 2 MB.

## Suspended workspaces

If Relay suspends a workspace, its keys stop working. Contact support.

See [Errors](/docs/help/errors/) for every status.
