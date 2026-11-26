---
title: Errors
description: Every HTTP status and message the Relay API returns, and what to do about each.
---

The API has no error codes. An error is an HTTP status plus a JSON body with one fixed message:

```json
{ "error": "template not found" }
```

Match on the status first, then on the message. Messages never change between calls for the same cause. A `5xx` other than the `503` messages below is an unexpected failure with no guaranteed body. Retry it, and contact support if it keeps happening.

## 400 bad request

| Message | When |
| --- | --- |
| `invalid input` | The body is not valid JSON, a field fails validation, a cursor is not one Relay issued, an import has more than 500 rows, a members import has more than 1,000, or a campaign `at` is outside the allowed window. |
| `unknown merge field` | A template or campaign uses a merge field Relay does not know. |
| `unknown list` | A campaign update names a list that is not in your app. |
| `sender not verified` | A campaign update sets `fromEmail` to an address that is not a verified sender. |
| `no default sender` | A send omits `from` and the app has no default sender for the stream. |
| `unsubscribe link required` | A marketing message lacks `{{unsubscribe_url}}` in its html or text. |
| `unsubscribe only on marketing` | A template with an unsubscribe link is sent on a stream other than marketing. |

## 401 unauthorized

| Message | When |
| --- | --- |
| `unauthorized` | The key is missing, malformed, disabled or expired, or the workspace is not active. |

## 403 forbidden

| Message | When |
| --- | --- |
| `workspace_suspended` | The workspace is suspended, so it cannot send. |
| `hook managed by platform admin` | The audience hook is a binding set up by a platform admin. A key cannot change or remove it. |

## 404 not found

| Message | When |
| --- | --- |
| `not found` | The resource does not exist or belongs to another app, a template in a campaign request is missing, or the path names an unknown campaign action or import kind. |
| `template not found` | A template send names a template your app does not have. |

## 409 conflict

| Message | When |
| --- | --- |
| `template disabled` | A template send names a template that is not enabled. |
| `template event taken` | Another template of the app already uses the event. |
| `template in use` | An automation still uses the template. |
| `list in use` | A scheduled, sending or paused campaign uses the list. |
| `address suppressed` | The address is on the suppression list, so it cannot join a list. |
| `campaign not editable` | The campaign is no longer a draft. |
| `campaign not sending` | You paused a campaign that is not sending. |
| `campaign not paused` | You resumed a campaign that is not paused. |
| `campaign not cancellable` | The campaign is not scheduled, sending or paused. |
| `campaign not ready: data_fields_need_hook` | A campaign update would switch a hook campaign to lists while its bodies use data fields. |
| `campaign not ready: <problems>` | The draft is incomplete. `<problems>` is a comma-separated list of `from_missing`, `subject_missing`, `html_missing`, `text_missing`, `audience_empty`, `audience_hook_missing`, `data_fields_need_hook`, `unsubscribe_missing` and `postal_address_missing`. |
| `unknown list` | An import names a list that is not in your app. |
| `import ref taken` | An `importRef` is already used by another app. |

## 422 unprocessable

| Message | When |
| --- | --- |
| `sender_not_verified` | A send uses a `from` address that is not a verified sender. |

## 429 too many requests

| Message | When |
| --- | --- |
| `rate limited` | The key went over 600 requests per minute. Wait and retry. |
| `quota_exceeded` | The monthly send quota is used up. |

## 503 service unavailable

| Message | When |
| --- | --- |
| `could not schedule` | Relay could not start the campaign run. Try again. |
| `could not resume` | Relay could not restart the run. The campaign stays paused. Try again. |
| `audience hook unavailable` | Relay cannot sign audience hook requests right now. |
| `webhooks unavailable` | Relay cannot sign webhooks right now. |

## Errors from a Worker binding

A [Worker binding](/docs/worker-binding/) call that fails throws an `Error` with the same message. It has no status. Invalid input to a method that validates with a schema throws the validation error instead of `invalid input`.
