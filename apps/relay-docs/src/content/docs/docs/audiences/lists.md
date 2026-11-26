---
title: Lists
description: Create lists of contacts, add and import people, and export a list.
---

**API and console.** A list holds the contacts a campaign sends to. It belongs to one app and records where consent came from. See the [lists endpoints](/docs/api/lists/).

## Create a list in the console

1. Open **Lists** and click **New list**.
2. Choose the app if you have more than one.
3. Name the list, for example `Newsletter subscribers`.
4. Pick the **Consent** source and add an optional note. See [Consent](/docs/audiences/consent/).
5. Click **Create list**.

You cannot move a list to another app. Create a new list there.

## Add contacts

On the list page:

- **Add contact** takes an email, and optionally a first and last name.
- **Import CSV** takes a `.csv` file up to 2 MB. The `email` column is required. Other columns: `first_name`, `last_name`, `name` and `consent_at`. Relay shows counts when it finishes: added, already on list, suppressed, invalid and duplicates.
- **Export CSV** downloads the list.

Through the API, `POST /api/v1/lists/{id}/members` adds one contact and `POST /api/v1/lists/{id}/import` adds up to 1,000 rows. See [contacts](/docs/audiences/contacts/).

## Edit and delete

**Edit list** changes the name, consent source and note. **Delete** removes the list. Its contacts leave it, and campaigns that use it no longer send to it. Mail already sent is unaffected.

## Move data in bulk

To bring existing lists, templates, campaigns, messages and suppressions into Relay, use the [import endpoint](/docs/api/import/).
