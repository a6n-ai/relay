import type { Env } from "../env";
import { clientFor } from "../do/client";
import { describeError } from "../core/log";

// A failed refresh is not fatal: the DO's 5-minute TTL is the backstop. The log carries the cause.
export async function refreshWorkspaceLimits(env: Env, workspaceId: string): Promise<void> {
  try {
    await clientFor(env, workspaceId).refreshLimits(workspaceId);
  } catch (err) {
    console.error("refreshLimits failed", workspaceId, describeError(err));
  }
}
