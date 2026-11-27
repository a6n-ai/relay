---
title: Suppressions
description: Why an address gets no mail, how to suppress one by hand and how to lift it.
---

**Done in the console.** A suppressed address gets no mail. A message to it is recorded with the status `suppressed` and nothing is sent.

## Why an address is suppressed

| Reason | How it happens |
| --- | --- |
| Unsubscribed | The person used the unsubscribe link. |
| Bounced | The address bounced permanently. Relay adds it. |
| Complaint | The person marked a message as spam. Relay adds it. |
| Added manually | You added it. |

A suppression covers all streams or one stream. Unsubscribes also opt the person out of marketing mail from your brand's domain.

## Review suppressions

Open **Messages**, then **Suppressions**. The table shows Email, Reason, Stream and Added. Search by the start of an address, or filter by stream. The stream filter narrows the rows loaded on the page.

## Suppress an address

1. Click **Suppress address**.
2. Enter the email.
3. Choose **All streams** or one stream.
4. Click **Add suppression**.

## Remove a suppression

Open the row menu and choose **Remove**. Mail to the address can be sent again.

You cannot remove an Unsubscribed or Complaint suppression. Those people opted out.

## Through the API

To check a suppression, send a message and read its status. See [Messages](/docs/sending/messages/).
