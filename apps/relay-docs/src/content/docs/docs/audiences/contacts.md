---
title: Contacts
description: Add, update, import and remove the people on a list.
---

**API and console.** A contact is one email address on one list, with an optional first and last name.

## Add a contact

Console: open the list and click **Add contact**.

API:

```sh
curl -X POST https://relay.a6n.ai/api/v1/lists/LIST_ID/members \
  -H "Authorization: Bearer rk_test_..." \
  -H "Content-Type: application/json" \
  -d '{ "email": "ada@acme.test", "firstName": "Ada", "lastName": "Lovelace" }'
```

Email is lowercased and must be valid, up to 254 characters. Names take up to 80 characters. `consentAt` is optional. It is a Unix time in milliseconds and cannot be in the future.

## Import many

`POST /api/v1/lists/{id}/import` takes `{ "rows": [...] }` with up to 1,000 contacts. Each row has the same fields as above.

## What the console shows

The contact table lists Email, Name, Source (Manual or Import), Added and Status. A contact can show **Opted out** for a brand domain after an unsubscribe.

Row actions: **Edit contact** changes the name. **Remove contact** takes the person off this list. Mail to them is not affected.

## Endpoints

- [Lists and members](/docs/api/lists/)
