---
title: Stats
description: Read a campaign's counts for sent, delivered, opened, clicked and more.
---

**API and console.** Once a campaign is no longer a draft, its page becomes a report.

## Counts

| Count | Meaning |
| --- | --- |
| Recipients | People the campaign is sending to. |
| Waiting | Messages still queued. |
| Sent | Messages handed to the mail provider. |
| Delivered | Messages the recipient's server accepted. |
| Opened | Messages opened. |
| Clicked | Messages with a link click. |
| Bounced | Messages that bounced. |
| Complaints | Recipients who marked mail as spam. |
| Unsubscribed | Recipients who unsubscribed. |
| Suppressed | Addresses skipped because they are suppressed. |
| Failed | Messages Relay could not send. |

While a campaign is scheduled or sending, the page refreshes by itself. It keeps refreshing while mail is still waiting. A progress bar shows recipients against the people who can receive it. Under the counts you see when it was scheduled, started and finished.

## Over the API

`GET /api/v1/campaigns/{id}/stats` returns the counts. See the [campaigns endpoints](/docs/api/campaigns/).

## Per message

Each message has its own timeline. Open **Messages**, **Sent**, and click a row. See [Messages](/docs/sending/messages/).
