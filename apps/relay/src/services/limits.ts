import type { Env } from "../env";
import { clientFor } from "../do/client";

// A failed refresh is not fatal: the DO's 5-minute TTL is the backstop. Logs carry ids only.
export async function refreshWorkspaceLimits(env: Env, workspaceId: string): Promise<void> {
  try {
    await clientFor(env, workspaceId).refreshLimits(workspaceId);
  } catch {
    console.error("refreshLimits failed", workspaceId);
  }
}
