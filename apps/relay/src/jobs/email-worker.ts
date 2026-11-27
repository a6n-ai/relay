import { eq } from "drizzle-orm";
import { r2Keys } from "../core/r2-keys";
import { INBOUND_GRACE_MS, inboxForRecipient } from "../core/addresses";
import { securityDb } from "../db/security/client";
import { workspace } from "../db/security/schema";
import type { Env } from "../env";
import type { InboundJob } from "../core/jobs";
import { describeError } from "../core/log";
import { MAX_INBOUND_BYTES } from "../core/inbound-limits";

// Fails closed: a missing workspace row is treated as not accepting mail.
async function acceptsInbound(env: Env, workspaceId: string, now: number): Promise<boolean> {
  const [ws] = await securityDb(env)
    .select({ status: workspace.status, suspendedAt: workspace.suspendedAt })
    .from(workspace)
    .where(eq(workspace.id, workspaceId));
  if (!ws) return false;
  if (ws.status !== "suspended") return true;
  return ws.suspendedAt !== null && now - ws.suspendedAt.getTime() <= INBOUND_GRACE_MS;
}

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
  let accepting: boolean;
  try {
    inbox = await inboxForRecipient(env, envelopeTo);
    accepting = inbox ? await acceptsInbound(env, inbox.workspaceId, Date.now()) : true;
  } catch (err) {
    console.error("address lookup failed", describeError(err));
    message.setReject("Mailbox unavailable");
    return;
  }
  if (!inbox) {
    message.setReject("No such mailbox");
    return;
  }
  if (!accepting) {
    message.setReject("Mailbox unavailable");
    return;
  }

  const receivedAt = Date.now();
  const iso = new Date(receivedAt).toISOString();
  const rawKey = r2Keys.raw(inbox.workspaceId, iso, crypto.randomUUID());
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
    console.error("inbound queueing failed", describeError(err));
    try {
      await env.MAIL.delete(rawKey);
    } catch {
      // shortcut: best effort, the object may never have been written
    }
    message.setReject("Mailbox unavailable");
  }
}
