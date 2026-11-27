import type { Env } from "../env";
import { hookInputSchema } from "../core/audience-hook";
import { clientFor } from "../do/client";
import { writeAudit } from "../lib/auth/audit";
import { RelayError, codeOf } from "../shared/errors";
import type { KeyScope } from "../shared/scope";

// Keys set https hooks only. A binding names a Worker on this deployment, so a key never sets or removes one.
async function guardBinding(env: Env, scope: KeyScope): Promise<void> {
  const hook = await clientFor(env, scope.workspaceId).getAudienceHook(scope.workspaceId, scope.appId);
  if (hook?.kind === "binding") throw new RelayError("hook managed by platform admin");
}

export async function setAudienceHookForScope(env: Env, scope: KeyScope, input: unknown): Promise<{ secret: string | null }> {
  const parsed = hookInputSchema.safeParse(input);
  if (!parsed.success) throw new RelayError("invalid input");
  await guardBinding(env, scope);
  let result: { secret: string | null };
  try {
    result = await clientFor(env, scope.workspaceId).setAudienceHook(scope.workspaceId, scope.appId, { kind: "https", ...parsed.data });
  } catch (err) {
    if (codeOf(err) === "webhook key not configured") throw new RelayError("audience hook unavailable");
    throw err;
  }
  await writeAudit(env, { action: "app.audience_hook.set", actorUserId: null, workspaceId: scope.workspaceId, target: scope.appId, data: { keyId: scope.keyId, appId: scope.appId } });
  return result;
}

// Explicit fields: the secret is never read back, and a binding's name stays with the platform.
export async function getAudienceHookForScope(env: Env, scope: KeyScope) {
  const hook = await clientFor(env, scope.workspaceId).getAudienceHook(scope.workspaceId, scope.appId);
  return hook && { kind: hook.kind, url: hook.url, enabled: hook.enabled };
}

export async function deleteAudienceHookForScope(env: Env, scope: KeyScope): Promise<void> {
  await guardBinding(env, scope);
  if (!(await clientFor(env, scope.workspaceId).deleteAudienceHook(scope.workspaceId, scope.appId))) throw new RelayError("not found");
  await writeAudit(env, { action: "app.audience_hook.delete", actorUserId: null, workspaceId: scope.workspaceId, target: scope.appId, data: { keyId: scope.keyId, appId: scope.appId } });
}
