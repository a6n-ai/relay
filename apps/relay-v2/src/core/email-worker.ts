import type { Env, InboundJob } from "../env";
import { inboxForRecipient } from "./addresses";

export const MAX_INBOUND_BYTES = 26_214_400;

// Rejects happen at SMTP time, so nothing is written to R2 or queued for a letter we refuse.
export async function receiveEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  if (message.rawSize > MAX_INBOUND_BYTES) {
    message.setReject("Message is larger than 25 MiB");
    return;
  }
  const authResults = message.headers.get("authentication-results");
  if (/\bdmarc=fail\b/i.test(authResults ?? "")) {
    message.setReject("Message failed DMARC");
    return;
  }
  const envelopeTo = message.to.trim().toLowerCase();
  let inbox: Awaited<ReturnType<typeof inboxForRecipient>>;
  try {
    inbox = await inboxForRecipient(env, envelopeTo);
  } catch (err) {
    console.error("address lookup failed", (err as Error).name);
    message.setReject("Mailbox unavailable");
    return;
  }
  if (!inbox) {
    message.setReject("No such mailbox");
    return;
  }

  const receivedAt = Date.now();
  const iso = new Date(receivedAt).toISOString();
  const rawKey = `ws/${inbox.workspaceId}/raw/${iso.slice(0, 4)}/${iso.slice(5, 7)}/${crypto.randomUUID()}.eml`;
  const job: InboundJob = {
    workspaceId: inbox.workspaceId,
    appId: inbox.appId,
    addressId: inbox.addressId,
    rawKey,
    envelopeFrom: message.from,
    envelopeTo,
    authResults,
    receivedAt,
  };
  try {
    await env.MAIL.put(rawKey, message.raw.pipeThrough(new FixedLengthStream(message.rawSize)));
    await env.INBOUND.send(job);
  } catch (err) {
    console.error("inbound queueing failed", (err as Error).name);
    try {
      await env.MAIL.delete(rawKey);
    } catch {
      // shortcut: best effort, the object may never have been written
    }
    message.setReject("Mailbox unavailable");
  }
}
