---
title: Streams
description: The transactional, tracked and marketing streams on the send call.
---

**API.** Every send names a stream in the `stream` field. The value is one of three.

| Stream | Use it for |
| --- | --- |
| `transactional` | Receipts, password resets and other one-to-one mail. |
| `tracked` | One-to-one mail where you want opens and clicks recorded. |
| `marketing` | Campaigns and other mail sent to many people. |

## What the stream changes

- **Default sender.** Marketing mail uses the app's default marketing sender. The other streams use the default transactional sender. This applies only when you leave out `from`.
- **Opt-outs.** A marketing message needs `{{unsubscribe_url}}` in both bodies. An address that opted out of a brand's marketing mail gets no more marketing mail from that brand's domain.
- **Suppressions.** A suppression can apply to all streams or to one. A message on a covered stream is `suppressed`. See [Suppressions](/docs/audiences/suppressions/).
- **Tracking.** Each stream has its own sending configuration. Open and click events appear on the message timeline and in campaign stats.

`{{unsubscribe_url}}` works only on `marketing`. A template that uses it fails with `unsubscribe only on marketing` on other streams.

## Example

```json
{ "stream": "marketing", "to": "ada@acme.test", "subject": "Spring sale", "html": "<p>...{{unsubscribe_url}}</p>", "text": "...{{unsubscribe_url}}" }
```

See [Messages](/docs/sending/messages/) and the [messages endpoint](/docs/api/messages/).
