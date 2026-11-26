---
title: Consent
description: Record where each list's consent came from.
---

**Done in the console.** You set consent on a list when you create or edit it. Relay keeps it with the list as your record.

## Consent sources

| Label | Meaning |
| --- | --- |
| Customer (purchase) | They bought from you. |
| Opted in | They asked to hear from you. |
| Event sign-up | They signed up at an event. |
| Other | Another source. Describe it in the note. |

Add a **Consent note** of up to 500 characters, such as where the contacts came from.

New contacts take the list's consent. The add and import dialogs show it.

## Opt-outs

Marketing mail must include `{{unsubscribe_url}}`. When someone uses the link, Relay stops marketing mail to them from your brand's domain. The contact shows **Opted out** on the list. See [Suppressions](/docs/audiences/suppressions/).

## Audience hook consent

When your app supplies the audience, each person carries `consent` of `express` or `implied` and a `consentAt` time. See [Audience hook](/docs/audiences/audience-hook/).
