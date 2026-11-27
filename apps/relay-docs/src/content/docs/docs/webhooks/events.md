---
title: Events
description: The events Relay sends to your webhook URL and the payload of each.
---

**API and console.** A webhook is an HTTPS URL that Relay calls when an event happens. Webhooks belong to an app. See the [webhooks endpoints](/docs/api/webhooks/).

## Set one up in the console

1. Open **Apps**, click your app, then click **Webhooks**.
2. Click **New webhook**.
3. Enter the URL and tick the events.
4. Click **Create webhook**.
5. Copy the signing secret. Relay shows it once. You need it to [verify signatures](/docs/webhooks/signatures/).

The URL must use HTTPS, point to a public host and contain no username or password. Private and local addresses are refused.

Each webhook has an **Enabled** switch. Click a webhook to see its deliveries: when, message, status, attempts, response code and last error.

## Event types

| Event | Label in the console | When |
| --- | --- | --- |
| `mailbox.received` | New letter received | Mail arrives at one of your receiving addresses. |

## The request

Relay sends a `POST` with a JSON body:

```json
{
  "id": "...",
  "type": "mailbox.received",
  "createdAt": 1767225600000,
  "data": {
    "to": "support@example.com",
    "from": "ada@acme.test",
    "html": "<p>Hello</p>",
    "text": "Hello",
    "subject": "Question about my order",
    "fromName": "Ada",
    "messageId": "<abc123@acme.test>",
    "envelopeTo": "support@example.com",
    "receivedAt": 1767225599000,
    "authResults": null,
    "envelopeFrom": "ada@acme.test"
  }
}
```

- `id` identifies the delivery. It is the same on every retry. Use it to ignore duplicates.
- `createdAt` and `receivedAt` are Unix times in milliseconds.
- `fromName` and `authResults` can be `null`.
- `authResults` holds every `Authentication-Results` header in the letter, joined. The sender can write one of them, so do not trust a sender because it says `dmarc=pass`. Relay already refuses letters that fail DMARC.

Headers:

| Header | Value |
| --- | --- |
| `content-type` | `application/json` |
| `x-relay-event` | The event type, such as `mailbox.received`. |
| `x-relay-signature` | `sha256=` and the hex signature of the raw body. |

Reply with any `2xx` status to confirm. Relay reads only the status. Relay does not follow redirects, and waits 10 seconds. Anything else counts as a failure and Relay [retries](/docs/webhooks/retries/).
