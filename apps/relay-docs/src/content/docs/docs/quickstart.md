---
title: Quickstart
description: Get an API key, verify a domain, add a sender and send your first message with curl.
---

You will send one email and find it in the console. Plan for about ten minutes, plus the time your DNS provider takes to publish records.

## Before you start

You need an invite to a Relay workspace. Sign in at [relay.a6n.ai](https://relay.a6n.ai/sign-in). Your workspace has at least one app. If it has none, create one under **Apps** with **New app**. Sign in with an email code or Google. You can also set a password under **Settings**, then sign in with it.

## 1. Get an API key

Ask a workspace admin or owner for a key, or create one on the app's page.

**Done in the console.** To create one yourself, you need permission to write apps.

1. Open **Apps** and click your app.
2. In the **API keys** panel, click **Create key**.
3. Name it, for example `Production`, and click **Create key**.
4. Copy the key now. Relay shows it once.

A key belongs to one app in one workspace. Keep it on your server. In the examples below it appears as `rk_test_...`.

## 2. Add and verify a domain

**Done in the console.**

1. Open **Domains** and click **Add domain**.
2. Enter your domain, for example `example.com`. Leave out `https://` and any path.
3. Click **Add domain**.
4. Open **DNS records** on the new row. Add each record at your DNS provider. They are CNAME records.
5. Click the row menu, then **Check now**. The status changes to Verified. If it does not, wait and check again. DNS can take a while.

See [Domains](/docs/sending/domains/) for more.

## 3. Add a sender address

**Done in the console.**

1. On **Domains**, click **Add address**.
2. Enter the part before the `@`, for example `hello`, and pick your verified domain.
3. Choose the app. Leave **Use** on **Sends**.
4. Click **Add address**.

Open your app and set the address as a default sender under **Default senders**. Then you can leave out `from` in requests.

## 4. Send a message

```sh
curl -X POST https://relay.a6n.ai/api/v1/messages \
  -H "Authorization: Bearer rk_test_..." \
  -H "Content-Type: application/json" \
  -d '{
    "stream": "transactional",
    "from": "hello@example.com",
    "to": "ada@acme.test",
    "subject": "Welcome to Acme",
    "html": "<p>Your account is ready.</p>",
    "text": "Your account is ready."
  }'
```

Relay answers with status `202`:

```json
{ "messageId": "msg_...", "status": "queued", "duplicate": false }
```

`queued` means Relay accepted the message and will send it. See the [messages endpoint](/docs/api/messages/) for every field.

## 5. See it in Messages

Open **Messages**, then **Sent**. Your message is the newest row. Click it to see its timeline: Queued, then Sent, then delivery events as they arrive.

The status is **Suppressed** if the address was blocked before sending. See [Suppressions](/docs/audiences/suppressions/).

## Next

- Pick a [stream](/docs/sending/streams/) for each kind of mail.
- Check the [limits](/docs/sending/limits/).
- Receive [webhooks](/docs/webhooks/events/).
- If a call fails, see [Errors](/docs/help/errors/) and [Troubleshooting](/docs/help/troubleshooting/).
