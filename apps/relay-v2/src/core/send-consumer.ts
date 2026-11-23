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
      const body = message.body;
      try {
        const { workspaceId, messageId } = body;
        // A job of an unknown kind must never reach the send path.
        if (body.kind !== undefined && body.kind !== "send" && body.kind !== "finalize") {
          console.error("relay-send: unknown job kind, acking", messageId);
          return message.ack();
        }
        const stub = clientFor(env, workspaceId);
        if (body.kind === "finalize") {
          if (await stub.markSent(workspaceId, messageId, body.sesMessageId)) countSent(workspaceId);
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

        // SES accepted the message, so the send job must never run again. A finalize job carries the SES id instead.
        let changed: boolean;
        try {
          changed = await stub.markSent(workspaceId, messageId, receipt.sesMessageId);
        } catch {
          console.error("relay-send: markSent failed, enqueueing finalize", messageId);
          // shortcut: if the finalize enqueue also fails, the SES id is lost and the sweeper may resend (duplicate email). Upgrade: persist the SES id in the DO before acking.
          await env.SEND.send({ kind: "finalize", workspaceId, messageId, sesMessageId: receipt.sesMessageId }).catch(() =>
            console.error("relay-send: finalize enqueue failed, SES id not recorded", messageId),
          );
          return message.ack();
        }
        if (changed) countSent(workspaceId);
        message.ack();
      } catch (err) {
        console.error("relay-send: job failed, retrying", body?.messageId, errorText(err));
        message.retry({ delaySeconds: 30 });
      }
    }),
  );

  const day = utcDay(Date.now());
  await Promise.all([...sentByWorkspace].map(([workspaceId, n]) => bumpUsage(env, workspaceId, day, { sent: n })));
  return { sent };
}
