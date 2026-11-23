import type { Env, SendJob } from "../env";
import { clientFor } from "./messages";
import { MAX_SEND_ATTEMPTS, isRetryableSesError, retryDelaySeconds, sesTransport, type SesTransport } from "./ses";
import { bumpUsage, utcDay } from "./usage";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function handleSendBatch(
  batch: MessageBatch<SendJob>,
  env: Env,
  transport: SesTransport = sesTransport(env),
): Promise<{ sent: number }> {
  let sent = 0;
  const sentByWorkspace = new Map<string, number>();
  const countSent = (workspaceId: string) => {
    sent++;
    sentByWorkspace.set(workspaceId, (sentByWorkspace.get(workspaceId) ?? 0) + 1);
  };

  await Promise.all(
    batch.messages.map(async (message) => {
      const { workspaceId, messageId, sesMessageId } = message.body;
      const stub = clientFor(env, workspaceId);
      try {
        if (sesMessageId) {
          await stub.markSent(workspaceId, messageId, sesMessageId);
          countSent(workspaceId);
          return message.ack();
        }

        const claim = await stub.claimSend(workspaceId, messageId);
        if (claim.kind === "skip") return message.ack();
        if (claim.kind === "busy") return message.retry({ delaySeconds: claim.retryInSeconds });

        let receipt: { sesMessageId: string };
        try {
          receipt = await transport.send(claim.request);
        } catch (err) {
          const final = !isRetryableSesError(err) || claim.attempt >= MAX_SEND_ATTEMPTS;
          await stub.markSendFailed(workspaceId, messageId, errorText(err), final);
          return final ? message.ack() : message.retry({ delaySeconds: retryDelaySeconds(claim.attempt) });
        }

        try {
          await stub.markSent(workspaceId, messageId, receipt.sesMessageId);
        } catch (err) {
          // SES accepted the message, so the original job must never run again. Carry the SES id on a new job instead.
          console.error("relay-send: markSent failed, re-enqueueing the SES id", messageId, errorText(err));
          await env.SEND.send({ workspaceId, messageId, sesMessageId: receipt.sesMessageId }).catch((enqueueErr) =>
            console.error("relay-send: re-enqueue failed, SES id not recorded", messageId, errorText(enqueueErr)),
          );
          return message.ack();
        }
        countSent(workspaceId);
        message.ack();
      } catch (err) {
        console.error("relay-send: job failed, retrying", messageId, errorText(err));
        message.retry();
      }
    }),
  );

  const day = utcDay(Date.now());
  await Promise.all([...sentByWorkspace].map(([workspaceId, n]) => bumpUsage(env, workspaceId, day, { sent: n })));
  return { sent };
}
