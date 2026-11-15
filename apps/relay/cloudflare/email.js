// Cloudflare Email Routing hands mailbox letters here. The DB lives in the app, so only the
// "does this mailbox exist" check runs at SMTP time (signed, over the service binding). The letter
// goes to R2 and the inbound queue; the queue consumer hands it to the app.
export const MAX_BYTES = 26_214_400; // 25 MiB; the app's routed-letter cap is the same size but a separate limit

export async function sign(secret, body) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function receive(message, env) {
  if (message.rawSize > MAX_BYTES) {
    message.setReject("Message is larger than 25 MiB");
    return;
  }
  // Cloudflare stamps its SPF/DKIM/DMARC verdict; a forged From that fails DMARC never reaches a mailbox.
  const authResults = message.headers.get("authentication-results");
  if (/\bdmarc=fail\b/i.test(authResults ?? "")) {
    message.setReject("Message failed DMARC");
    return;
  }
  const body = JSON.stringify({ envelopeTo: message.to });
  const res = await env.WORKER_SELF_REFERENCE.fetch("https://internal/api/internal/mailbox/recipient", {
    method: "POST",
    headers: { "content-type": "application/json", "x-relay-signature": await sign(env.MAILBOX_INBOUND_SECRET, body) },
    body,
  });
  if (res.status === 404) {
    message.setReject("No such mailbox");
    return;
  }
  if (!res.ok) {
    console.error("mailbox recipient check failed", res.status, await res.text().catch(() => ""));
    message.setReject("Mailbox unavailable");
    return;
  }

  const rawId = crypto.randomUUID();
  const receivedAt = Date.now();
  const [yyyy, mm] = new Date(receivedAt).toISOString().split("-");
  const rawKey = `mail/in/${yyyy}/${mm}/${rawId}.eml`;
  try {
    await env.MAIL.put(rawKey, message.raw.pipeThrough(new FixedLengthStream(message.rawSize)));
    await env.INBOUND.send({ rawId, rawKey, envelopeFrom: message.from, envelopeTo: message.to, authResults, receivedAt });
  } catch (err) {
    console.error("mailbox inbound queueing failed", err);
    try {
      await env.MAIL.delete(rawKey);
    } catch {
      // best effort: the object may never have been written
    }
    message.setReject("Mailbox unavailable");
  }
}
