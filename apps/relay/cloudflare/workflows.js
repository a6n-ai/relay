import { WorkflowEntrypoint } from "cloudflare:workers";
import { createWake } from "./wake.js";

// The drain runs in the app (it needs the DB and the Next runtime), so the Workflow only
// sleeps until its time and re-enters the Worker over the service binding.
const RETRY = { retries: { limit: 5, delay: "30 seconds", backoff: "exponential" } };
const FALLBACK_MS = 15 * 60_000;

async function postTick(env) {
  const res = await env.WORKER_SELF_REFERENCE.fetch("https://internal/api/internal/tick", {
    method: "POST",
    headers: { authorization: "Bearer " + env.CRON_SECRET },
  });
  if (!res.ok) throw new Error(`tick failed ${res.status}`);
}

// The tick books the next wake itself. If it still fails after the step's retries, book a
// fallback here so the chain never dies silently.
export class RelayWake extends WorkflowEntrypoint {
  async run(event, step) {
    await step.sleepUntil("wait", new Date(event.payload.at));
    try {
      await step.do("run", RETRY, () => postTick(this.env));
    } catch (err) {
      console.error("wake failed after retries", err);
      await step.do("fallback", () => createWake(this.env.RELAY_WAKE, "wake", Date.now() + FALLBACK_MS));
    }
  }
}
