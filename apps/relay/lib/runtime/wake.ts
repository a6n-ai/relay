import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isWorkers } from "@foundry/commons/runtime/platform";
import { createWake } from "../../cloudflare/wake.js";

type Workflow = { create(o: { id: string; params: { at: number } }): Promise<unknown> };

// Ids are minute-rounded, and an id already used by a finished instance would swallow a nearer one.
const MIN_LEAD_MS = 60_000;

/** Run the tick at `at` (epoch ms), no sooner than a minute from now. Never throws. No-op off Workers. */
export async function scheduleWake(requestedAt: number): Promise<void> {
  if (!isWorkers()) return;
  const at = Math.max(requestedAt, Date.now() + MIN_LEAD_MS);
  try {
    const env = getCloudflareContext().env as unknown as { RELAY_WAKE: Workflow };
    await createWake(env.RELAY_WAKE, "wake", at);
  } catch (err) {
    console.error("wake failed", err);
  }
}
