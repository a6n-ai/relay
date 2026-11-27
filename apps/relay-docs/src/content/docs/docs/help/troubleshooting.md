---
title: Troubleshooting
description: Fixes for the problems you are most likely to hit when you send, run campaigns or receive webhooks.
---

Every API error is an HTTP status with a short message. [Errors](/docs/help/errors/) lists them all. This page covers what to do about the common ones.

## The API answers 401 unauthorized

- Send the key as `Authorization: Bearer rk_test_...`. Include `Bearer` and one space.
- Check that the key is active. Open the app, then **API keys**. A revoked key shows **Revoked**.
- A key works for one app. Use the key of the app that sends.
- If your workspace is suspended, its keys stop working. Contact [support](/docs/help/support/).

## The API answers 429

- `rate limited`: you went over 600 requests in 60 seconds on one key. Wait and retry.
- `quota_exceeded`: the workspace reached its monthly send quota. See [Limits](/docs/sending/limits/).

## The API answers 422 sender_not_verified

The `from` address is not a verified sender. Check **Domains**. The domain must show **Verified**, the address must exist for your app, and **Can send** must be on.

## The API answers 400

- `no_default_sender` (422): you left out `from` and the app has no default sender. Set one under **Default senders** on the app page, or pass `from`.
- `unsubscribe link required`: a `marketing` message needs `{{unsubscribe_url}}` in both `html` and `text`.
- `invalid input`: a field is missing or the wrong shape. Compare your body with the [messages endpoint](/docs/api/messages/).

## My domain will not verify

Press **Check now** on **Domains**. DNS can take a while to update. Check that each CNAME record matches the name and value in **DNS records** exactly. Some DNS providers add your domain to the end of the name for you. If yours does, enter only the part before your domain.

## A message shows suppressed

The address is on the suppression list. Open **Messages**, then **Suppressions**, and search for it. If you added it by mistake, **Remove** it. Unsubscribes and complaints cannot be removed. See [Suppressions](/docs/audiences/suppressions/).

## A message shows failed

Open the message and read its timeline. Relay tries a send up to 5 attempts in total (the first try plus 4 retries) before it marks the message `failed`.

## I cannot schedule a campaign

The editor lists what is missing under **Before it can be sent**. The usual causes are a missing `{{unsubscribe_url}}` in one of the two bodies, or no postal address. See [Campaigns](/docs/campaigns/campaigns/).

## My webhook never fires

- The URL must use HTTPS and be public. Private hosts and URLs with a username or password are refused.
- Check the **Enabled** switch.
- Open the webhook's deliveries and read **Response** and **Last error**.
- Reply with a `2xx` within 10 seconds, and do not redirect. See [Retries](/docs/webhooks/retries/).

## My webhook signature does not match

Hash the raw body, not a parsed copy. Use the signing secret of this webhook, and compare against `sha256=` plus hex. See [Signatures](/docs/webhooks/signatures/).

Still stuck? See [Support](/docs/help/support/).
