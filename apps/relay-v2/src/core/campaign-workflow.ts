import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "../env";
import { clientFor } from "./messages";

export type CampaignRunParams = { workspaceId: string; campaignId: string; runSeq: number; at: number };
export type CampaignStep = Pick<WorkflowStep, "do" | "sleep" | "sleepUntil">;

export const CHUNK_SIZE = 500;
export const ENQUEUE_BATCH = 100;
// Workflows allow 1,024 steps on Free and 10,000 on Paid (sleeps do not count). 1 start + 400 chunks fits both.
export const MAX_CHUNKS = 400;
const STEP_RETRY = { retries: { limit: 5, delay: "30 seconds", backoff: "exponential" }, timeout: "5 minutes" } as const;

export async function runCampaign(env: Env, p: CampaignRunParams, step: CampaignStep): Promise<"done" | "stopped"> {
  const stub = clientFor(env, p.workspaceId);
  if (p.at > Date.now()) await step.sleepUntil("wait", new Date(p.at));
  const started = await step.do("start", STEP_RETRY, () => stub.startCampaign(p.workspaceId, p.campaignId, p.runSeq));
  if (started === "stale") return "stopped";
  for (let n = 0; n < MAX_CHUNKS; n++) {
    const r = await step.do(`chunk-${n}`, STEP_RETRY, () =>
      stub.campaignChunk(p.workspaceId, p.campaignId, p.runSeq).then(({ state, enqueued, paceMs }) => ({ state, enqueued, paceMs })),
    );
    if (r.state === "done") return "done";
    if (r.state === "stopped") return "stopped";
    if (r.paceMs > 0) await step.sleep(`pace-${n}`, r.paceMs);
  }
  await step.do("too-many", STEP_RETRY, () => stub.pauseCampaign(p.workspaceId, p.campaignId, "too_many_recipients"));
  return "stopped";
}

export class CampaignWorkflow extends WorkflowEntrypoint<Env, CampaignRunParams> {
  async run(event: Readonly<WorkflowEvent<CampaignRunParams>>, step: WorkflowStep): Promise<"done" | "stopped"> {
    return runCampaign(this.env, event.payload, step);
  }
}
