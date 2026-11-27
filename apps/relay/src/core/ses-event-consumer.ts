import type { Env } from "../env";
import { clientFor } from "./messages";
import type { SesEventJob } from "./ses-events";
import { bumpUsage } from "./usage";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function handleSesEventBatch(batch: MessageBatch<SesEventJob>, env: Env): Promise<void> {
  const groups = new Map<string, Message<SesEventJob>[]>();
  for (const message of batch.messages) {
    const { workspaceId } = message.body;
    groups.set(workspaceId, [...(groups.get(workspaceId) ?? []), message]);
  }
  await Promise.all(
    [...groups].map(async ([workspaceId, messages]) => {
      try {
        const { usage, failed } = await clientFor(env, workspaceId).applySesEvents(
          workspaceId,
          messages.map((m) => m.body),
        );
        await Promise.all(usage.map((u) => bumpUsage(env, workspaceId, u.day, { sent: u.sent, delivered: u.delivered, bounced: u.bounced })));
        const failedIndexes = new Set(failed);
        messages.forEach((message, i) => (failedIndexes.has(i) ? message.retry({ delaySeconds: 30 }) : message.ack()));
      } catch (err) {
        console.error("relay-ses-events: apply failed, retrying", workspaceId, errorText(err));
        for (const message of messages) message.retry({ delaySeconds: 30 });
      }
    }),
  );
}
