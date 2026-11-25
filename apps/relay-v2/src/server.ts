import handler from "@tanstack/react-start/server-entry";
import { receiveEmail } from "./core/email-worker";
import { handleInboundBatch } from "./core/inbound-consumer";
import { sweepAll } from "./core/sweep-all";
import { handleSendBatch } from "./core/send-consumer";
import { handleSesEventBatch } from "./core/ses-event-consumer";
import type { SesEventJob } from "./core/ses-events";
import { handleWebhookBatch } from "./core/webhook-consumer";
import type { Env, InboundJob, SendJob, WebhookJob } from "./env";

export { CampaignWorkflow } from "./core/campaign-workflow";
export { ClientDO } from "./do/client-do";
export { RelayRpc } from "./rpc/relay-rpc";

export default {
  fetch: handler.fetch,
  email: receiveEmail,
  async scheduled(_controller: ScheduledController, env: Env) {
    const result = await sweepAll(env);
    console.log(`daily sweep: ${result.total} workspaces, ${result.behind.length} behind, ${result.failed.length} failed, ${result.releasedDomains} domains released`);
  },
  async queue(batch: MessageBatch<unknown>, env: Env) {
    if (batch.queue === "relay-send") {
      await handleSendBatch(batch as MessageBatch<SendJob>, env);
      return;
    }
    if (batch.queue === "relay-ses-events") {
      await handleSesEventBatch(batch as MessageBatch<SesEventJob>, env);
      return;
    }
    if (batch.queue === "relay-inbound-mail") {
      await handleInboundBatch(batch as MessageBatch<InboundJob>, env);
      return;
    }
    if (batch.queue === "relay-webhooks") {
      await handleWebhookBatch(batch as MessageBatch<WebhookJob>, env);
      return;
    }
    console.error(`queue ${batch.queue}: no handler, acked ${batch.messages.length} messages`);
    batch.ackAll();
  },
};
