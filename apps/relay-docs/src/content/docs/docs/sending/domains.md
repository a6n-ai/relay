---
title: Domains
description: Add a sending domain, publish its DNS records and add sender addresses.
---

**Done in the console.** Domains and addresses have no HTTP API.

Relay sends only from addresses on a verified domain. If you send from an address that is not verified, the API answers `422` with `sender_not_verified`.

## Add a domain

1. Open **Domains**.
2. Click **Add domain**.
3. Enter the domain, for example `example.com`. Do not add `https://` or a path.
4. Click **Add domain**.

You need write access to sending.

## Verify it

1. On the **Domains** table, open **DNS records** on your domain's row.
2. Publish each record at your DNS provider. Each is a CNAME: a name and the value it points to.
3. Open the row menu and choose **Check now**.

The status shows **Verified**, **Pending** or **Failed**. If it is not verified yet, Relay tells you DNS can take a while. Check again later.

## Add a sender address

1. Click **Add address**.
2. Enter the part before the `@` and pick the domain. Use letters, numbers, dots, hyphens or underscores.
3. Pick the app the address belongs to.
4. Under **Use**, choose **Sends**, **Receives** or **Both**.
   - **Sends:** the app sends mail from this address.
   - **Receives:** mail to this address lands in Relay. Apps cannot send from it.
   - **Both:** the app sends from it, and mail to it lands in Relay.
5. Optionally set a name shown to recipients, and a reply-to address.
6. Click **Add address**.

You can add an address only on a domain that is already added. To receive mail on it, verify the domain first.

## Manage addresses

The **Addresses** table has a **Can send** switch for each address. Turn it off to stop apps sending from it. The row menu has **Edit** and **Remove**. You cannot change an address or its app after you add it. Remove it and add a new one.

Removing an address stops mail to it and stops the app sending from it.

## Default senders

On the app page, **Default senders** sets which address Relay uses when a request leaves out `from`. Set one for transactional mail and one for marketing mail. If neither exists, the API answers `422` with `no_default_sender`.
