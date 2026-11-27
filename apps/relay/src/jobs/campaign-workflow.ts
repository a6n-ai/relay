import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import type { Env } from "../env";
import { CHUNK_SIZE, MAX_RUN_RECIPIENTS, type CampaignRunParams } from "../core/campaign-run";
import { AUDIENCE_FAILED, fetchAudiencePage } from "../core/audience-hook";
import { type AudiencePage } from "../core/audience-protocol";
import { clientFor } from "../do/client";
import { codeOf } from "../shared/errors";

export type CampaignStep = Pick<WorkflowStep, "do" | "sleep" | "sleepUntil">;

// Workflows allow 1,024 steps on Free and 10,000 on Paid (sleeps do not count). 1 start + 400 chunks fits both.
const MAX_CHUNKS = MAX_RUN_RECIPIENTS / CHUNK_SIZE;
// A hook page is three steps (page, ingest, pace), so 300 pages plus the start step stays under the Free limit of 1,024.
const HOOK_MAX_PAGES = 300;
const STEP_RETRY = { retries: { limit: 5, delay: "30 seconds", backoff: "exponential" }, timeout: "5 minutes" } as const;

type Stub = ReturnType<typeof clientFor>;
type HookPageResult = { kind: "stale" } | { kind: "page"; page: AudiencePage };

// A hook page's step output is the whole page, which must stay under the 1 MiB per-step limit; the DO's 1,000,000-byte response cap keeps it there.
async function fetchHookPage(env: Env, stub: Stub, p: CampaignRunParams): Promise<HookPageResult> {
  const call = await stub.audienceCall(p.workspaceId, p.campaignId, p.runSeq);
  if (call === "stale") return { kind: "stale" };
  if (call === "no_hook") throw new NonRetryableError(AUDIENCE_FAILED);
  return { kind: "page", page: await fetchAudiencePage(env, call) };
}

export async function runCampaign(env: Env, p: CampaignRunParams, step: CampaignStep): Promise<"done" | "stopped"> {
  const stub = clientFor(env, p.workspaceId);
  try {
    if (p.at > Date.now()) await step.sleepUntil("wait", new Date(p.at));
    const started = await step.do("start", STEP_RETRY, async () => {
      const r = await stub.startCampaign(p.workspaceId, p.campaignId, p.runSeq);
      return typeof r === "object" ? { page: r.page } : r;
    });
    if (started === "stale") return "stopped";
    if (typeof started === "object") {
      for (let n = started.page; n < HOOK_MAX_PAGES; n++) {
        const got = await step.do(`page-${n}`, STEP_RETRY, () => fetchHookPage(env, stub, p));
        if (got.kind === "stale") return "stopped";
        const r = await step.do(`ingest-${n}`, STEP_RETRY, () =>
          stub.campaignHookPage(p.workspaceId, p.campaignId, p.runSeq, n, got.page).then(({ state, enqueued, paceMs }) => ({ state, enqueued, paceMs })),
        );
        if (r.state === "done") return "done";
        if (r.state === "stopped") return "stopped";
        if (r.paceMs > 0) await step.sleep(`pace-${n}`, r.paceMs);
      }
    } else {
      for (let n = 0; n < MAX_CHUNKS; n++) {
        const r = await step.do(`chunk-${n}`, STEP_RETRY, () =>
          stub.campaignChunk(p.workspaceId, p.campaignId, p.runSeq).then(({ state, enqueued, paceMs }) => ({ state, enqueued, paceMs })),
        );
        if (r.state === "done") return "done";
        if (r.state === "stopped") return "stopped";
        if (r.paceMs > 0) await step.sleep(`pace-${n}`, r.paceMs);
      }
    }
    await step.do("too-many", STEP_RETRY, () => stub.pauseRunning(p.workspaceId, p.campaignId, p.runSeq, "too_many_recipients"));
    return "stopped";
  } catch (err) {
    // A step that exhausted its retries would leave the campaign sending forever; pause it so the operator sees why.
    const reason = codeOf(err) === "audience_failed" ? "audience_failed" : "run_failed";
    await step.do("fail", STEP_RETRY, () => stub.pauseRunning(p.workspaceId, p.campaignId, p.runSeq, reason));
    return "stopped";
  }
}

export class CampaignWorkflow extends WorkflowEntrypoint<Env, CampaignRunParams> {
  async run(event: Readonly<WorkflowEvent<CampaignRunParams>>, step: WorkflowStep): Promise<"done" | "stopped"> {
    return runCampaign(this.env, event.payload, step);
  }
}
