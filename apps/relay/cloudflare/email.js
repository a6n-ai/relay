// Cloudflare Email Routing delivers mailbox letters here. The DB lives in the app, so the raw
// letter and its envelope are signed with MAILBOX_INBOUND_SECRET (same HMAC as lib/webhooks/sign.ts)
// and posted to the inbound route over the service binding; the envelope recipient picks the mailbox.
export const MAX_BYTES = 256 * 1024; // = MAX_MAILBOX_INBOUND_BYTES in @relay/engine

async function sign(secret, body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function receive(message, env) {
  if (message.rawSize > MAX_BYTES) {
    message.setReject("Letter is larger than 256 KB");
    return;
  }
  // Cloudflare stamps its SPF/DKIM/DMARC verdict; a forged From that fails DMARC never reaches a mailbox.
  if (/\bdmarc=fail\b/i.test(message.headers.get("authentication-results") ?? "")) {
    message.setReject("Message failed DMARC");
    return;
  }
  const body = await new Response(message.raw).text();
  const res = await env.WORKER_SELF_REFERENCE.fetch("https://internal/api/internal/mailbox/inbound", {
    method: "POST",
    headers: {
      "content-type": "message/rfc822",
      "x-relay-envelope-to": message.to,
      "x-relay-envelope-from": message.from,
      "x-relay-signature": await sign(env.MAILBOX_INBOUND_SECRET, `${message.to}\n${message.from}\n${body}`),
    },
    body,
  });
  if (res.status === 404) {
    message.setReject("No such mailbox");
  } else if (!res.ok) {
    console.error("mailbox inbound failed", res.status, await res.text().catch(() => ""));
    message.setReject("Mailbox unavailable, try later");
  }
}
