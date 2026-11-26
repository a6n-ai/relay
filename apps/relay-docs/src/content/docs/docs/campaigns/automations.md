---
title: Automations
description: Send a template automatically when someone joins a list.
---

**Done in the console.** An automation sends a template to each person who joins a list. Automations have no HTTP API.

## Create one

1. Open **Campaigns**, then **Automations**.
2. Click **New automation**.
3. Name it, for example `Welcome email after sign-up`.
4. Choose the **List**, the **Template** and the sender address.
5. Choose the **Delay**: **Right away**, **1 hour**, **24 hours** or **Custom**. Custom takes 0 to 720 hours.
6. Click **Create automation**.

You need a list and a template first. The dialog tells you when you have none.

## Manage automations

The table shows each automation's list, template, delay, how many messages are waiting and how many were sent. Use the **Enabled** switch to turn one on or off.

**Edit** changes the name, template, sender and delay. You cannot change the list. Create a new automation for another list.

**Delete** drops waiting messages. Mail already sent is unaffected.

Automations need permission to send campaigns.

See [Templates](/docs/sending/templates/) and [Lists](/docs/audiences/lists/).
