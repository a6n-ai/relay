export const MAX_WEBHOOK_ATTEMPTS = 6;

export function webhookRetryDelaySeconds(attempt: number): number {
  return Math.min(60 * 2 ** (attempt - 1), 3600);
}

export type WebhookClaim =
  | { kind: "skip" }
  | { kind: "busy"; retryInSeconds: number }
  | { kind: "deliver"; attempt: number; url: string; body: string; headers: Record<string, string> };

export type WebhookOutcome = { ok: true; status: number } | { ok: false; status?: number; error: string };
