import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { MAX_ATTEMPTS, nextBackoffMs } from "@relay/engine";
import { db } from "@/db/client";
import { tenantWebhookDelivery } from "@/db/schema";
import { tenantWebhooksService, webhookDeliveryService } from "@/lib/services/webhooks.service";
import { signWebhookBody } from "./sign";

const TIMEOUT_MS = 10_000;

export async function drainWebhookDeliveries(limit = 25): Promise<number> {
  const now = Date.now();
  const rows = await db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(tenantWebhookDelivery)
      .where(and(eq(tenantWebhookDelivery.status, "pending"), lte(tenantWebhookDelivery.nextAttemptAt, now)))
      .orderBy(asc(tenantWebhookDelivery.nextAttemptAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    await tx
      .update(tenantWebhookDelivery)
      .set({ status: "processing" })
      .where(inArray(tenantWebhookDelivery.id, due.map((r) => r.id)));
    return due;
  });

  for (const row of rows) {
    const hook = await tenantWebhooksService.findById(row.webhookId);
    const attempts = row.attempts + 1;
    if (!hook || !hook.enabled) {
      await webhookDeliveryService.update(row.publicId, {
        status: "failed",
        attempts,
        lastError: "Webhook missing or disabled",
      });
      continue;
    }

    const body = JSON.stringify({
      id: row.publicId,
      type: row.event,
      createdAt: row.createdAt,
      data: row.payload,
    });
    const sig = signWebhookBody(hook.secret, body);

    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-relay-event": row.event,
          "x-relay-signature": `sha256=${sig}`,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await webhookDeliveryService.update(row.publicId, {
        status: "sent",
        attempts,
        lastError: null,
        responseStatus: res.status,
      });
    } catch (err) {
      const lastError = err instanceof Error ? err.message : String(err);
      const dead = attempts >= MAX_ATTEMPTS;
      await webhookDeliveryService.update(row.publicId, {
        status: dead ? "failed" : "pending",
        attempts,
        lastError,
        nextAttemptAt: Date.now() + nextBackoffMs(attempts),
      });
    }
  }

  return rows.length;
}
