import type { Env } from "../env";
import type { InboundJob } from "../core/jobs";
import { clientFor } from "../do/client";
import { bumpUsage, utcDay } from "../core/usage";
import { describeError } from "../core/log";

export const MAX_INBOUND_ATTEMPTS = 5;

export async function handleInboundBatch(batch: MessageBatch<InboundJob>, env: Env): Promise<void> {
  await Promise.all(
    batch.messages.map(async (message) => {
      const job = message.body;
      if (!job?.workspaceId || !job.rawKey) {
        console.error("relay-inbound-mail:malformed job, acking", message.id);
        return message.ack();
      }
      const { workspaceId } = job;
      try {
        const result = await clientFor(env, workspaceId).ingestInbound(workspaceId, job);
        if (result.outcome === "inserted") await bumpUsage(env, workspaceId, utcDay(job.receivedAt), { inbound: 1 });
        return message.ack();
      } catch (err) {
        if (message.attempts < MAX_INBOUND_ATTEMPTS) {
          console.error("relay-inbound-mail:job failed, retrying", message.id, workspaceId, describeError(err));
          return message.retry({ delaySeconds: 30 * message.attempts });
        }
        try {
          await clientFor(env, workspaceId).recordInboundFailure(workspaceId, job, "Processing failed");
          console.error("relay-inbound-mail:job failed at last attempt, recorded", message.id, workspaceId, describeError(err));
          return message.ack();
        } catch (recordErr) {
          console.error("relay-inbound-mail:failure record failed, retrying", message.id, workspaceId, describeError(recordErr));
          return message.retry({ delaySeconds: 30 * message.attempts });
        }
      }
    }),
  );
}
