// Queue consumers for inbound letters, kept apart from worker.js so they can be unit-tested.
import { sign } from "./email.js";
import { retryDelaySeconds } from "./queue-consumer.js";

export const INBOUND_MAX_ATTEMPTS = 5;
// Matches max_retries on relay-inbound-dlq in wrangler.jsonc: the last delivery is attempt INBOUND_DLQ_MAX_RETRIES + 1.
export const INBOUND_DLQ_MAX_RETRIES = 10;

// Signs the JSON body the way the app's signedInternalRoute verifies it.
export async function postInternal(env, path, payload) {
  const body = JSON.stringify(payload);
  return env.WORKER_SELF_REFERENCE.fetch(`https://internal/api/internal/mailbox/inbound/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-relay-signature": await sign(env.MAILBOX_INBOUND_SECRET, body) },
    body,
  });
}

// Resolves an error string when the post did not return 200, null when it did.
async function send(post, path, body) {
  try {
    const res = await post(path, body);
    return res.ok ? null : `${path} ${res.status}`;
  } catch (err) {
    return `${path} ${err?.message ?? err}`;
  }
}

export async function consumeInbound(batch, post) {
  for (const msg of batch.messages) {
    const error = await send(post, "queued", msg.body);
    if (!error) {
      msg.ack();
    } else if (msg.attempts < INBOUND_MAX_ATTEMPTS) {
      msg.retry({ delaySeconds: retryDelaySeconds(30_000 * 2 ** (msg.attempts - 1)) });
    } else if (!(await send(post, "failed", { message: msg.body, attempts: msg.attempts, error }))) {
      msg.ack();
    } else {
      // Left unacked on purpose: the message goes to the DLQ, which records the failure.
      msg.retry({ delaySeconds: retryDelaySeconds(300_000) });
    }
  }
}

export async function consumeInboundDlq(batch, post) {
  for (const msg of batch.messages) {
    const error = await send(post, "failed", { message: msg.body, attempts: msg.attempts });
    if (!error) {
      msg.ack();
      continue;
    }
    if (msg.attempts > INBOUND_DLQ_MAX_RETRIES) {
      console.error(
        JSON.stringify({ event: "inbound_mail_given_up", rawId: msg.body.rawId, rawKey: msg.body.rawKey, error }),
      );
    }
    msg.retry({ delaySeconds: retryDelaySeconds(60_000 * 2 ** (msg.attempts - 1)) });
  }
}
