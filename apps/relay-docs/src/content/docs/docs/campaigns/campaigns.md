---
title: Campaigns
description: Write a campaign, choose its audience, schedule it, and pause or cancel it.
---

**API and console.** A campaign sends one email to many people. The console is the place to write it. The API creates, schedules and controls campaigns. See the [campaigns endpoints](/docs/api/campaigns/).

## Create a campaign in the console

1. Open **Campaigns** and click **New campaign**.
2. Choose the app, name the campaign and pick **Start from**: a blank campaign or a template.
3. Click **Create campaign**. The editor opens.

## Write it

Under **Content**, choose **Send from** (a verified sender), then fill the **Subject**, **HTML** and **Plain text**. Use [merge fields](/docs/sending/templates/). Click **Preview** to check it, and **Send test to me** to get a copy.

Under **Audience**, choose one:

- **Lists.** Tick the lists. Relay shows how many will receive it, and how many are suppressed or lapsed.
- **App audience.** Relay asks your server for the people. Connect it on the app page first. See [Audience hook](/docs/audiences/audience-hook/).

Click **Save**.

## Before it can be sent

The editor lists what is missing. You cannot schedule until the list is empty:

- Choose a verified From address.
- Add a subject, the HTML body and the plain text body.
- Choose at least one list, or connect an app audience.
- Add `{{unsubscribe_url}}` to the HTML and plain text.
- Add a postal address and `{{postal_address}}` to the body. You can save the postal address from the editor.
- `{{data.*}}` fields need the App audience, not a list.

## Schedule it

Click **Schedule...**. Choose **Send now** or **Schedule for later** and pick a time in your time zone. The time must be in the future. Click **Send now** or **Schedule**.

Over the API, `POST /api/v1/campaigns/{id}/schedule` takes `{ "at": <milliseconds> }`.

## Control a running campaign

A campaign page after scheduling shows a report. Its buttons depend on the status:

- **Unschedule** while it is scheduled.
- **Pause** while it is sending.
- **Resume** while it is paused.
- **Cancel campaign** while scheduled, sending or paused. Queued mail is not sent. Mail already sent is unaffected.

A campaign can pause itself, for example when the workspace reaches its [quota](/docs/sending/limits/).

The API has `schedule`, `pause`, `resume` and `cancel` actions at `/api/v1/campaigns/{id}/{action}`.

## Delete a draft

On a draft, **Delete** removes it and its body. You cannot undo this.

See [Stats](/docs/campaigns/stats/) for the report.
