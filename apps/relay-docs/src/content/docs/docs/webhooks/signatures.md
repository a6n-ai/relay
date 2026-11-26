---
title: Signatures
description: Verify that a webhook came from Relay with its HMAC-SHA256 signature.
---

Relay signs every webhook. Check the signature before you trust a request.

## How it is signed

Relay computes an HMAC with SHA-256 over the raw request body, using your webhook's signing secret as the key. It sends the result as lowercase hex in the `x-relay-signature` header, with a `sha256=` prefix:

```http
x-relay-signature: sha256=3f5c...
```

The secret appears once, when you create the webhook. Store it on your server. You can also pass your own `secret` when you create a webhook over the API. It must be 16 to 256 characters.

## Verify in Node

Use the raw body, not a parsed and re-encoded one. Compare in constant time.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function isFromRelay(rawBody: string, header: string | null, signingSecret: string): boolean {
  const expected = `sha256=${createHmac("sha256", signingSecret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Reject the request with `401` when it returns `false`.

## Verify in a Worker

```ts
export async function isFromRelay(rawBody: string, header: string | null, signingSecret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
  const a = enc.encode(header ?? "");
  const b = enc.encode(`sha256=${hex}`);
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}
```

## Audience hook requests

Audience hook requests use the same signature. They also carry `sentAt` in the signed body and in `x-relay-timestamp`. Reject a request if `sentAt` is more than five minutes old. See [Audience hook](/docs/audiences/audience-hook/).

## Keep the secret safe

Do not put the secret in client code or logs. Relay stores it encrypted and cannot show it again. To change it, create a new webhook and delete the old one.
