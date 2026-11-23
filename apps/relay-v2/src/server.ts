import handler from "@tanstack/react-start/server-entry";
import { handleSendBatch } from "./core/send-consumer";
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
    // No relay-ses-events handler until Task 8; ack so nothing piles up in its DLQ.
    console.error(`queue ${batch.queue}: no handler yet, acked ${batch.messages.length} messages`);
    batch.ackAll();
  },
};
