import type { Env, WebhookJob } from "../env";
import { clientFor } from "./messages";
import { describeError } from "./log";

export const MAX_WEBHOOK_ATTEMPTS = 6;
const FETCH_TIMEOUT_MS = 10_000;

export function webhookRetryDelaySeconds(attempt: number): number {
  return Math.min(60 * 2 ** (attempt - 1), 3600);
}

export type WebhookClaim =
  | { kind: "skip" }
  | { kind: "busy"; retryInSeconds: number }
  | { kind: "deliver"; attempt: number; url: string; body: string; headers: Record<string, string> };

export type WebhookOutcome = { ok: true; status: number } | { ok: false; status?: number; error: string };

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "unknown";
}

// Only the status and a fixed reason leave this function: the tenant's response body is discarded unread.
async function post(fetchImpl: typeof fetch, claim: Extract<WebhookClaim, { kind: "deliver" }>): Promise<WebhookOutcome> {
  try {
    const res = await fetchImpl(claim.url, {
      method: "POST",
      headers: claim.headers,
      body: claim.body,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    await res.body?.cancel().catch(() => {});
    if (res.status >= 200 && res.status <= 299) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: errorName(err) };
  }
}

export async function handleWebhookBatch(
  batch: MessageBatch<WebhookJob>,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await Promise.all(
    batch.messages.map(async (message) => {
      const job = message.body;
      if (!job?.workspaceId || !job.deliveryId) {
        console.error("relay-webhooks: malformed job, acking", message.id);
        return message.ack();
      }
      const { workspaceId, deliveryId } = job;
      try {
        const stub = clientFor(env, workspaceId);
        const claim = await stub.claimWebhookDelivery(workspaceId, deliveryId);
        if (claim.kind === "skip") return message.ack();
        if (claim.kind === "busy") return message.retry({ delaySeconds: claim.retryInSeconds });

        const outcome = await post(fetchImpl, claim);
        if (!outcome.ok) console.error("relay-webhooks: attempt failed", deliveryId, outcome.error);
        const { retryInSeconds } = await stub.markWebhookDelivery(workspaceId, deliveryId, outcome);
        if (retryInSeconds === null) return message.ack();
        return message.retry({ delaySeconds: retryInSeconds });
      } catch (err) {
        console.error("relay-webhooks: job failed, retrying", deliveryId, describeError(err));
        message.retry({ delaySeconds: 30 });
      }
    }),
  );
}
