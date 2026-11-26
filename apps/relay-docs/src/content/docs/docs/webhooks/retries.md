---
title: Retries
description: How Relay retries a failed webhook, and how to retry one yourself.
---

A delivery succeeds when your URL answers with a `2xx` status within 10 seconds. Anything else is a failed attempt: another status, a timeout, a redirect or a connection error.

## Schedule

Relay makes up to 6 attempts. After a failed attempt, it waits before the next:

| After attempt | Wait |
| --- | --- |
| 1 | 1 minute |
| 2 | 2 minutes |
| 3 | 4 minutes |
| 4 | 8 minutes |
| 5 | 16 minutes |

After the sixth failure, the delivery is marked `failed` and Relay stops trying.

The wait doubles each time. Relay may deliver the same event more than once. The `id` in the body stays the same, so use it to ignore repeats.

## Delivery statuses

| Status | Meaning |
| --- | --- |
| `pending` | Waiting to be sent or retried. |
| `sent` | Your URL answered with a `2xx`. |
| `failed` | All attempts failed. |

## See and retry deliveries

**Done in the console.** Open the app, click **Webhooks**, then click the webhook. The table shows each delivery's status, attempts, response code and last error.

Use the row menu to retry a failed delivery. Relay queues it again with a fresh set of attempts. You can retry only failed deliveries, and only while the webhook is enabled.

## When a webhook is disabled or deleted

Turn off the **Enabled** switch and Relay stops calling the URL. Deliveries still waiting for a disabled webhook are marked failed. The same happens if you delete the webhook. Relay also checks the URL again before each attempt, so a URL that is no longer public fails.

See [Events](/docs/webhooks/events/) and [Signatures](/docs/webhooks/signatures/).
