---
title: Concepts
description: The pieces of Relay - workspaces, apps, API keys, sender addresses, streams and suppressions.
---

## Workspace

A workspace is your team's space in Relay. It holds your domains, apps, lists and team members. You join one by invite. Members have a role: owner, admin, member or billing.

A workspace has a monthly send quota. See [Limits](/docs/sending/limits/).

## App

An app is one product or environment that sends mail. It has its own API keys, default senders, lists, templates, campaigns and webhooks. Create apps under **Apps**.

## API key

An API key lets one app call the API. It belongs to one app in one workspace. Send it as a bearer token:

```http
Authorization: Bearer rk_test_...
```

Keys are created and revoked in the console. Revoking a key stops its requests right away. Each key has its own rate limit. See [Limits](/docs/sending/limits/).

## Domain and sender address

A domain is one you own, such as `example.com`. You verify it with DNS records. A sender address, such as `hello@example.com`, lives on a verified domain and belongs to an app. Mail sends only from addresses on verified domains. See [Domains](/docs/sending/domains/).

## Stream

Every message has a stream: `transactional`, `tracked` or `marketing`. The stream picks the default sender and decides which opt-outs apply. See [Streams](/docs/sending/streams/).

## Message

A message is one email to one recipient. It moves through `queued`, `sent`, `failed` or `suppressed`. See [Messages](/docs/sending/messages/).

## Lists, contacts and campaigns

A list holds contacts and records where their consent came from. A campaign sends one email to a list, or to an audience your app supplies. See [Lists](/docs/audiences/lists/) and [Campaigns](/docs/campaigns/campaigns/).

## Suppression

A suppressed address gets no mail. Relay adds addresses after a permanent bounce, a complaint or an unsubscribe. You can add one by hand. See [Suppressions](/docs/audiences/suppressions/).

## Webhook

A webhook is an HTTPS URL that Relay calls when an event happens. Relay signs each call. See [Webhooks](/docs/webhooks/events/).
