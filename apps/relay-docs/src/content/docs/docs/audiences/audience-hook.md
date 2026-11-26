---
title: Audience hook
description: Let Relay ask your app who should receive a campaign.
---

**API and console.** An audience hook is an HTTPS URL on your server. When a campaign uses it, Relay calls the URL for the people to send to, a page at a time. Use it when your own database is the source of truth.

## Set it up in the console

1. Open **Apps** and click your app.
2. In **App audience**, enter the **Audience URL**. It must be a public `https://` URL.
3. Leave **Enabled** on and click **Save audience**.
4. Copy the secret. Relay shows it once. Use it to verify requests.

**Rotate secret** replaces the secret. The old one stops working at once. **Remove** deletes the hook. Campaigns that use it cannot reach their audience until you connect one again.

In a campaign, under **Audience**, choose **App audience**. The **Audience filter** is a string up to 1,000 characters that Relay passes to your server as `audience`.

You can also manage the hook over HTTP. See the [audience hook endpoint](/docs/api/audience-hook/).

## The request

Relay sends a POST with a JSON body:

```json
{
  "type": "audience.page",
  "appId": "...",
  "workspaceId": "...",
  "campaignId": "...",
  "audience": "spring-newsletter",
  "cursor": null,
  "limit": 500,
  "sentAt": 1767225600000
}
```

Relay signs the body. Headers carry the signature in `x-relay-signature` as `sha256=<hex>` and the send time in `x-relay-timestamp`. Check both. See [Signatures](/docs/webhooks/signatures/) for the HMAC method. Reject requests older than five minutes.

## Your response

Return up to 500 people and a cursor for the next page, or `null` when done:

```json
{
  "recipients": [
    {
      "email": "ada@acme.test",
      "firstName": "Ada",
      "consent": "express",
      "consentAt": 1767225600000,
      "data": { "plan": "pro" }
    }
  ],
  "nextCursor": null
}
```

- `consent` is `express` or `implied`. `consentAt` is a Unix time in milliseconds, not in the future.
- `data` takes up to 10 keys. Keys use lowercase letters, numbers and underscores, up to 40 characters. Values are up to 200 characters. In the campaign, use them as `{{data.plan}}`.
- Relay skips a person who fails validation. If the page is not valid JSON of this shape, the run fails.
- Relay waits 15 seconds for a response. Keep the response under 1 MB.
- Your URL must be public and use HTTPS.
