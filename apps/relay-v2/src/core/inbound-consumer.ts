import type { Env, InboundJob } from "../env";
import { clientFor } from "./messages";
import { bumpUsage, utcDay } from "./usage";

export const MAX_INBOUND_ATTEMPTS = 5;

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}

export async function handleInboundBatch(batch: MessageBatch<InboundJob>, env: Env): Promise<void> {
  await Promise.all(
    batch.messages.map(async (message) => {
      const job = message.body;
      if (!job?.workspaceId || !job.rawKey) {
        console.error("relay-v2-inbound:malformed job, acking", message.id);
        return message.ack();
      }
      const { workspaceId } = job;
      try {
        const result = await clientFor(env, workspaceId).ingestInbound(workspaceId, job);
        if (result.outcome === "inserted") await bumpUsage(env, workspaceId, utcDay(job.receivedAt), { inbound: 1 });
        return message.ack();
      } catch (err) {
        if (message.attempts < MAX_INBOUND_ATTEMPTS) {
          console.error("relay-v2-inbound:job failed, retrying", message.id, workspaceId, errorName(err));
          return message.retry({ delaySeconds: 30 * message.attempts });
        }
        try {
          await clientFor(env, workspaceId).recordInboundFailure(workspaceId, job, "Processing failed");
          console.error("relay-v2-inbound:job failed at last attempt, recorded", message.id, workspaceId, errorName(err));
          return message.ack();
        } catch (recordErr) {
          console.error("relay-v2-inbound:failure record failed, retrying", message.id, workspaceId, errorName(recordErr));
          return message.retry({ delaySeconds: 30 * message.attempts });
        }
      }
    }),
  );
}
