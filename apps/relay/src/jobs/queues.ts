import type { Env } from "../env";
import { handleInboundBatch } from "./inbound-consumer";
import { handleSendBatch } from "./send-consumer";
import { handleSesEventBatch } from "./ses-event-consumer";
import { handleWebhookBatch } from "./webhook-consumer";

// Queue name (wrangler.jsonc consumers) to its consumer. Each consumer types its own job payload (core/jobs.ts, core/ses-events.ts).
const consumers = {
  "relay-send": handleSendBatch,
  "relay-ses-events": handleSesEventBatch,
  "relay-inbound-mail": handleInboundBatch,
  "relay-webhooks": handleWebhookBatch,
};

export async function handleQueue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  const consume = Object.hasOwn(consumers, batch.queue) ? (consumers[batch.queue as keyof typeof consumers] as (b: MessageBatch<unknown>, e: Env) => Promise<void>) : null;
  if (!consume) {
    console.error(`queue ${batch.queue}: no handler, acked ${batch.messages.length} messages`);
    batch.ackAll();
    return;
  }
  await consume(batch, env);
}
