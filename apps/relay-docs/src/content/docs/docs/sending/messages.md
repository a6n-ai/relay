---
title: Messages
description: Send one email with the API and follow it through queued, sent, failed or suppressed.
---

**API.** `POST /api/v1/messages` sends one email to one recipient. See the [messages endpoint](/docs/api/messages/) for the full reference.

## Send a message

```sh
curl -X POST https://relay.a6n.ai/api/v1/messages \
  -H "Authorization: Bearer rk_test_..." \
  -H "Content-Type: application/json" \
  -d '{
    "stream": "transactional",
    "to": "ada@acme.test",
    "subject": "Your receipt",
    "html": "<p>Thanks for your order.</p>",
    "text": "Thanks for your order.",
    "idempotencyKey": "order-1042-receipt"
  }'
```

Relay answers `202` with `messageId`, `status` and `duplicate`.

## Fields

| Field | Required | Notes |
| --- | --- | --- |
| `stream` | Yes | `transactional`, `tracked` or `marketing`. See [Streams](/docs/sending/streams/). |
| `to` | Yes | One email address. |
| `subject` | Yes | No line breaks. |
| `html` | Yes | The HTML body. |
| `text` | Yes | The plain text body. |
| `from` | No | Must be a verified sender. If you leave it out, Relay uses the app's default sender for the stream. |
| `fromName` | No | Up to 100 characters. Overrides the sender's name. |
| `replyTo` | No | One email address. |
| `event` | No | A label for your own records. |
| `idempotencyKey` | No | See below. |
| `attachments` | No | Up to 3. Each has `filename`, `contentType` and base64 `content`, up to 5 MB decoded. |

## Idempotency

Send the same `idempotencyKey` twice for one app and Relay sends one message. The second call returns the first message's id with `"duplicate": true`. Use a key that names the thing you are sending, such as an order id. Retry a failed request with the same key.

## Statuses

| Status | Meaning |
| --- | --- |
| `queued` | Relay accepted it and will send it. |
| `sent` | Relay handed it to the mail provider. |
| `failed` | Relay could not send it. |
| `suppressed` | The address is suppressed, so nothing was sent. |

Relay retries a failed send up to 5 times, waiting longer each time, before it marks the message `failed`.

Delivery events arrive after `sent`: delivery, bounce, complaint, open and click. You see them on the message's timeline in the console.

## Marketing mail

A `marketing` message must contain `{{unsubscribe_url}}` in both `html` and `text`. Otherwise Relay answers `400` with `unsubscribe link required`.

## Get a message

`GET /api/v1/messages/{id}` returns one message. See the [messages endpoint](/docs/api/messages/).

## See messages in the console

**Done in the console.** Open **Messages**. **Sent** lists outbound mail and **Received** lists mail to your receiving addresses. Search by address, or filter by status and app. Click a row for the body, attachments and timeline.

If a call fails, see [Errors](/docs/help/errors/).
