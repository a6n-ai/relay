import { describeError } from "../core/log";
import { releaseStalePendingDomains } from "../services/domain-state";
import type { Env } from "../env";
import { sweepWorkspaces } from "./do-sweep";

// Shared by the internal sweep route and the daily cron. A release failure is logged, never fatal to the sweep.
export async function sweepAll(env: Env) {
  const swept = await sweepWorkspaces(env);
  let releasedDomains = 0;
  try {
    releasedDomains = await releaseStalePendingDomains(env);
  } catch (err) {
    console.error("stale domain release failed", describeError(err));
  }
  return { ...swept, releasedDomains };
}
