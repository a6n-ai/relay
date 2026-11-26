---
title: Templates
description: Save an email once, then send it with merge fields from the API.
---

**API and console.** A template stores a subject, an HTML body and a plain text body. You create and edit templates in the console or through the [templates endpoints](/docs/api/templates/).

## Create a template in the console

1. Open **Campaigns**, then **Templates**.
2. Click **New template**.
3. On the template page, set the name, subject, **HTML** and **Plain text**.
4. Click **Preview** to see the rendered email, then **Save**.

Other fields on the page:

- **Event key** and **Locale** say which event and language the template is for.
- **Intro** holds a short line of intro text.
- **Enabled** turns the template on or off. Sending a disabled template fails with `template disabled`.

## Merge fields

Use these in the subject, HTML and text:

| Field | Value |
| --- | --- |
| `{{contact.name}}` | First and last name. |
| `{{contact.first_name}}` | First name. |
| `{{contact.last_name}}` | Last name. |
| `{{contact.email}}` | The recipient's email. |
| `{{unsubscribe_url}}` | The opt-out link. Marketing only. |
| `{{postal_address}}` | Your workspace's postal address. |
| `{{data.key}}` | A value you pass when you send. |

Relay escapes values in HTML. A `{{data.key}}` you do not pass renders empty.

## Send a template

```sh
curl -X POST https://relay.a6n.ai/api/v1/templates/send \
  -H "Authorization: Bearer rk_test_..." \
  -H "Content-Type: application/json" \
  -d '{
    "stream": "transactional",
    "to": "ada@acme.test",
    "templateId": "TEMPLATE_ID",
    "contact": { "firstName": "Ada" },
    "data": { "plan": "Pro" }
  }'
```

`data` takes up to 10 keys. Each key uses lowercase letters, numbers and underscores. Each value is up to 200 characters. A template that contains `{{unsubscribe_url}}` can be sent only on the `marketing` stream.

See the [template send endpoint](/docs/api/templates/) for the response.
