import { createWake } from "./wake.js";

let booted = false;
const TTL_S = 30 * 24 * 3600;

// No cron: the first request after each DEPLOYMENT starts the self-scheduling wake chain. The
// deployment id in KV gates it, so each isolate reads KV once. A KV read failure skips it; the
// chain sustains itself once started, and every enqueue also signals the Queue.
export function bootOnce(env, ctx) {
  if (booted) return;
  booted = true;
  ctx.waitUntil(
    (async () => {
      const key = `wake-bootstrap:${env.CF_VERSION_METADATA?.id ?? "unknown"}`;
      let seen;
      try {
        seen = await env.CACHE.get(key);
      } catch (err) {
        console.error("bootstrap marker read failed; skipping", err);
        return;
      }
      if (seen != null) return;
      await env.CACHE.put(key, "1", { expirationTtl: TTL_S });
      await createWake(env.RELAY_WAKE, "wake", Date.now() + 60_000);
    })().catch((err) => console.error("bootstrap threw", err)),
  );
}

export const resetBootForTest = () => {
  booted = false;
};
