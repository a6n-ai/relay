import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { Env } from "../env";
import { seed } from "./seed";
import { opsParamsSchema, type OpsParams } from "../core/ops-params";
import { sweepAll } from "./sweep-all";

export class OpsWorkflow extends WorkflowEntrypoint<Env, OpsParams> {
  async run(event: WorkflowEvent<OpsParams>, step: WorkflowStep) {
    const parsed = opsParamsSchema.safeParse(event.payload);
    if (!parsed.success) throw new NonRetryableError("invalid input");
    const params = parsed.data;
    if (params.op === "seed") {
      // Seed looks up before it writes, so a retried step completes rather than duplicates.
      const result = await step.do("seed", { retries: { limit: 2, delay: "10 seconds" } }, async () => {
        await seed(this.env, params.input);
        return { ok: true };
      });
      return result;
    }
    return step.do("sweep", async () => {
      const r = await sweepAll(this.env);
      return { total: r.total, behind: r.behind.length, failed: r.failed.length, releasedDomains: r.releasedDomains };
    });
  }
}
