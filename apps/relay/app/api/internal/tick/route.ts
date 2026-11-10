import { withCronAuth } from "@foundry/cloud/cron-auth";
import { workerTick } from "@/lib/notifications/drain";
import { nextDueAt } from "@/lib/notifications/next-due";
import { scheduleWake } from "@/lib/runtime/wake";

export const dynamic = "force-dynamic";

// Longest delay a Queue retry accepts; anything later needs a RelayWake.
const QUEUE_MAX_DELAY_MS = 43_200_000;

export const POST = withCronAuth(() => process.env.CRON_SECRET)(async () => {
  const counts = await workerTick();
  const next = await nextDueAt();
  const retryAfterMs = next == null ? null : Math.max(0, next - Date.now());
  if (next != null && retryAfterMs! > QUEUE_MAX_DELAY_MS) await scheduleWake(next);
  return Response.json({ ...counts, retryAfterMs });
});
