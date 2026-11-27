---
title: API reference
description: Base URL, authentication, rate limit, pagination and the error format of the Relay API, with an index of every endpoint.
---

The Relay API is JSON over HTTPS. Every endpoint lives under `https://relay.a6n.ai/api/v1`.

## Authentication

Send an API key as a bearer token:

```
Authorization: Bearer rk_test_example
```

A key belongs to one app in one workspace. Every request sees only that app's data, and an id from another app returns `404 not found`. Create keys in the console, on the app's page, or ask a workspace admin or owner.

## Rate limit

Each key can make 600 requests per minute. Past that, Relay answers `429` with `{ "error": "rate limited" }`. Wait and retry.

## Request and response format

- Send `Content-Type: application/json` with a body. A body that is not valid JSON is a `400 invalid input`.
- Most responses wrap the result as `{ "data": ... }`. The send, get message and webhook endpoints return the object itself. Each endpoint's page shows the exact shape.
- Times are epoch milliseconds. Ids are strings such as `msg_…`, `tpl_…` and `cmp_…`.
- Lists of templates, campaigns and members return 50 rows and a `nextCursor`. Pass it back as `?cursor=` for the next page. `nextCursor` is `null` on the last page.

## Errors

An error is an HTTP status and a JSON body with one fixed message. There are no error codes.

```json
{ "error": "not found" }
```

Every endpoint can return these two:

| Status | Message | When |
| --- | --- | --- |
| 401 | `unauthorized` | The key is missing, malformed, revoked or belongs to a suspended workspace. |
| 429 | `rate limited` | The key went over its limit. |

[Errors](/docs/help/errors/) lists every other status and message.

## Endpoints

| Page | Endpoints |
| --- | --- |
| [Messages](/docs/api/messages/) | `POST /messages`, `GET /messages/{id}` |
| [Templates](/docs/api/templates/) | `GET` and `POST /templates`, `GET`, `PATCH` and `DELETE /templates/{id}`, `POST /templates/send` |
| [Lists](/docs/api/lists/) | `GET` and `POST /lists`, `GET`, `PATCH` and `DELETE /lists/{id}`, members, member import and export |
| [Campaigns](/docs/api/campaigns/) | `GET` and `POST /campaigns`, `GET`, `PATCH` and `DELETE /campaigns/{id}`, schedule, pause, resume, cancel and stats |
| [Webhooks](/docs/api/webhooks/) | `GET` and `POST /webhooks`, `PATCH` and `DELETE /webhooks/{id}` |
| [Audience hook](/docs/api/audience-hook/) | `GET`, `PUT` and `DELETE /audience-hook` |

From another Cloudflare Worker you can skip HTTP and call Relay through a [Worker binding](/docs/worker-binding/).
