import { env } from "cloudflare:workers";
import handler from "@tanstack/react-start/server-entry";
import { DOCS_404_PATH, isDocsMiss } from "./docs-404";
import { receiveEmail } from "./jobs/email-worker";
import { handleInboundBatch } from "./jobs/inbound-consumer";
import { sweepAll } from "./jobs/sweep-all";
import { handleSendBatch } from "./jobs/send-consumer";
import { handleSesEventBatch } from "./jobs/ses-event-consumer";
import type { SesEventJob } from "./core/ses-events";
import { handleWebhookBatch } from "./jobs/webhook-consumer";
import type { Env } from "./env";
import type { InboundJob, SendJob, WebhookJob } from "./core/jobs";

export { CampaignWorkflow } from "./jobs/campaign-workflow";
export { OpsWorkflow } from "./jobs/ops-workflow";
export { ClientDO } from "./do/client-do";
export { RelayRpc } from "./rpc/relay-rpc";

// A path under /docs that no static file matched shows the docs 404 page, not the console's.
async function fetchWithDocs404(...args: Parameters<typeof handler.fetch>): Promise<Response> {
  const res = await handler.fetch(...args);
  const request = args[0] as Request;
  if (!isDocsMiss(new URL(request.url).pathname, res.status)) return res;
  const page = await env.ASSETS.fetch(new URL(DOCS_404_PATH, request.url));
  return page.status === 200 ? new Response(page.body, { status: 404, headers: page.headers }) : res;
}

export default {
  fetch: fetchWithDocs404,
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
