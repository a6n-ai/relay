// Custom Worker entry: OpenNext's fetch handler plus the outbox Queue consumer and the RelayWake
// Workflow (no cron). wrangler.jsonc `main` points here.
import openNext from "../.open-next/worker.js";
import { bootOnce } from "./bootstrap.js";
import { consume } from "./queue-consumer.js";

export * from "../.open-next/worker.js";
export { RelayWake } from "./workflows.js";

const STATIC_EXT = /\.(?:js|css|map|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|txt|xml)$/i;

// The drain runs in the app, so the consumer only re-enters the Worker over the service binding.
async function tick(env) {
  const res = await env.WORKER_SELF_REFERENCE.fetch("https://internal/api/internal/tick", {
    method: "POST",
    headers: { authorization: "Bearer " + env.CRON_SECRET },
  });
  if (!res.ok) {
    console.error("tick failed", res.status, await res.text().catch(() => ""));
    return { ok: false, retryAfterMs: 0 };
  }
  const body = await res.json().catch(() => ({}));
  return { ok: true, retryAfterMs: body.retryAfterMs ?? null };
}

export default {
  fetch(request, env, ctx) {
    if (!STATIC_EXT.test(new URL(request.url).pathname)) bootOnce(env, ctx);
    return openNext.fetch(request, env, ctx);
  },
  async queue(batch, env) {
    await consume(batch, () => tick(env));
  },
};
