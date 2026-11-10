import { withCronAuth } from "@foundry/cloud/cron-auth";
import { workerTick } from "@/lib/notifications/drain";
import { nextDueAt } from "@/lib/notifications/next-due";
import { scheduleWake } from "@/lib/runtime/wake";

export const dynamic = "force-dynamic";

export const POST = withCronAuth(() => process.env.CRON_SECRET)(async () => {
  const counts = await workerTick();
  const next = await nextDueAt();
  const retryAfterMs = next == null ? null : Math.max(0, next - Date.now());
  // Queue retries are only the fast path (max_retries runs out); the wake chain is what never stops.
  if (next != null) await scheduleWake(next);
  return Response.json({ ...counts, retryAfterMs });
});
