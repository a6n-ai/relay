---
title: Worker binding
description: Call Relay from another Cloudflare Worker through a service binding, with every RelayRpc method.
---

If your app runs on Cloudflare Workers, call Relay through a service binding instead of HTTP. The binding runs the same checks as the HTTP API: the API key, the rate limit and the app scope.

## Set up the binding

Add a service binding to your Worker's `wrangler.jsonc`:

```jsonc
{
  "services": [{ "binding": "RELAY", "service": "relay", "entrypoint": "RelayRpc" }]
}
```

Then call a method. Every method takes the API key as its first argument:

```ts
const sent = await env.RELAY.send("rk_test_example", {
  stream: "transactional",
  from: "orders@acme.test",
  to: "ada@example.com",
  subject: "Your order is confirmed",
  html: "<p>Thanks for your order.</p>",
  text: "Thanks for your order.",
});
console.log(sent.messageId, sent.status);
```

## How it differs from HTTP

- Methods return the value itself. There is no `{ "data": ... }` wrapper, and there are no status codes.
- A list method returns `{ rows, nextCursor }`. Pass `nextCursor` back as the `cursor` argument. The members list returns the same shape.
- A failure throws an `Error`. For an error the API describes, its message is the same fixed message as the HTTP error, such as `not found` or `list in use`. See [Errors](/docs/help/errors/).
- A bad key throws `unauthorized`. A key over its limit throws `rate limited`.
- A method that validates its input with a schema throws the validation error for a bad shape, not `invalid input`. The suppression and message lookup methods throw `invalid input`.
- The input is validated with the same schemas as the HTTP request body, so the fields are the ones on the [API reference](/docs/api/) pages.

## Messages

| Method | What it does |
| --- | --- |
| `send(apiKey, input)` | Same as [Send a message](/docs/api/messages/). Returns `{ messageId, status, duplicate }`. |
| `sendTemplate(apiKey, input)` | Same as [Send a template](/docs/api/templates/). Returns `{ messageId, status, duplicate }`. |
| `getMessage(apiKey, id)` | Returns the message, or `null` when it does not exist for your app. |
| `messagesByKeys(apiKey, keys)` | Looks up messages by idempotency key. `keys` is 1 to 100 strings. Returns one entry per match with `key`, `messageId`, `status`, `sentAt`, `deliveredAt`, `bouncedAt`, `complainedAt`, `opens`, `clicks` and `error`. |

## Templates

| Method | What it does |
| --- | --- |
| `listTemplates(apiKey, cursor?)` | List templates, 50 per page. |
| `getTemplate(apiKey, id)` | Get one template. |
| `createTemplate(apiKey, input)` | Create a template. |
| `updateTemplate(apiKey, id, patch)` | Change the fields in `patch`. |
| `deleteTemplate(apiKey, id)` | Delete a template. |
| `templateOverrides(apiKey)` | Returns `event`, `locale`, `subject`, `intro` and `enabled` for each template of your app. |

## Lists and members

| Method | What it does |
| --- | --- |
| `listLists(apiKey)` | List every list of your app. |
| `createList(apiKey, input)` | Create a list. |
| `updateList(apiKey, id, patch)` | Change the fields in `patch`. |
| `deleteList(apiKey, id)` | Delete a list. |
| `listMembers(apiKey, listId, cursor?)` | List members, 50 per page. |
| `addMember(apiKey, listId, input)` | Add one member. Returns `"added"` or `"existing"`. |
| `removeMember(apiKey, listId, memberId)` | Remove one member. |
| `importMembers(apiKey, listId, rows)` | Add up to 1,000 members. `rows` is the array itself, not `{ rows }`. Returns `{ added, existing, suppressed }`. |

## Campaigns

| Method | What it does |
| --- | --- |
| `listCampaigns(apiKey, cursor?)` | List campaigns, 50 per page, without bodies. |
| `getCampaign(apiKey, id)` | Get one campaign. |
| `createCampaign(apiKey, input)` | Create a draft. |
| `updateCampaign(apiKey, id, patch)` | Edit a draft. |
| `deleteCampaign(apiKey, id)` | Delete a draft. |
| `scheduleCampaign(apiKey, id, at)` | Schedule a draft. `at` is epoch milliseconds. Returns `{ runSeq }`. |
| `pauseCampaign(apiKey, id)` | Pause a sending campaign. |
| `resumeCampaign(apiKey, id)` | Resume a paused campaign. Returns `{ runSeq }`. |
| `cancelCampaign(apiKey, id)` | Cancel a campaign. Returns `{ dropped }`. |
| `campaignStats(apiKey, id)` | Returns the delivery counters. |

## Audience hook

| Method | What it does |
| --- | --- |
| `setAudienceHook(apiKey, input)` | Same as [Set the audience hook](/docs/api/audience-hook/). Returns `{ secret }`. |
| `getAudienceHook(apiKey)` | Returns the hook, or `null` when there is none. |
| `deleteAudienceHook(apiKey)` | Remove the hook. |

## Suppressions

These three methods have no HTTP endpoint.

| Method | What it does |
| --- | --- |
| `isSuppressed(apiKey, email, stream, from?)` | Returns `true` when Relay will not send to the address on that stream. `stream` is `transactional`, `tracked` or `marketing`. Pass `from` to include that brand's opt-outs. |
| `suppressionStatus(apiKey, emails, from?)` | Checks 1 to 100 addresses. Returns `email`, `stream`, `reason` and `brandOptOut` for each suppressed one. |
| `suppress(apiKey, input)` | Suppresses an address. `input` is `{ email, reason, stream }`, with `reason` of `unsubscribe` or `manual` and `stream` of `"marketing"` or `null`. Returns `{ created }`. |

## Import

Each method takes the `rows` array of the matching [HTTP import](/docs/api/import/), up to 500 rows.

| Method | What it does |
| --- | --- |
| `importLists(apiKey, rows)` | Import lists. |
| `importTemplates(apiKey, rows)` | Import templates. |
| `importCampaigns(apiKey, rows)` | Import campaigns. |
| `importMessages(apiKey, rows)` | Import message history. |
| `importSuppressions(apiKey, rows)` | Import suppressions. |
