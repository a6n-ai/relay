import handler from "@tanstack/react-start/server-entry";
import { handleSendBatch } from "./core/send-consumer";
import { handleSesEventBatch } from "./core/ses-event-consumer";
import type { SesEventJob } from "./core/ses-events";
import type { Env, SendJob } from "./env";

export { ClientDO } from "./do/client-do";
export { RelayRpc } from "./rpc/relay-rpc";

export default {
  fetch: handler.fetch,
  async queue(batch: MessageBatch<unknown>, env: Env) {
    if (batch.queue === "relay-send") {
      await handleSendBatch(batch as MessageBatch<SendJob>, env);
      return;
    }
    if (batch.queue === "relay-ses-events") {
      await handleSesEventBatch(batch as MessageBatch<SesEventJob>, env);
      return;
    }
    console.error(`queue ${batch.queue}: no handler, acked ${batch.messages.length} messages`);
    batch.ackAll();
  },
};
