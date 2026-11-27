import type { Env } from "../env";
import { hookInputSchema } from "../core/audience-hook";
import { clientFor } from "../do/client";
import { RelayError, codeOf } from "../shared/errors";
import { ownApp, audit, type Principal } from "./principal";

// A binding names a Worker on this deployment: only a super admin sets or removes one (admin.ts), so a key never does.
async function guardBinding(env: Env, p: Principal, appId: string): Promise<void> {
  if (p.platformAdmin) return;
  const hook = await clientFor(env, p.workspaceId).getAudienceHook(p.workspaceId, appId);
  if (hook?.kind === "binding") throw new RelayError("hook managed by platform admin");
}

export async function setAudienceHook(env: Env, p: Principal, appId: string, input: unknown): Promise<{ secret: string | null }> {
  await ownApp(env, p, appId);
  await guardBinding(env, p, appId);
  const parsed = hookInputSchema.safeParse(input);
  if (!parsed.success) throw new RelayError("invalid input");
  let result: { secret: string | null };
  try {
    result = await clientFor(env, p.workspaceId).setAudienceHook(p.workspaceId, appId, { kind: "https", ...parsed.data });
  } catch (err) {
    if (codeOf(err) === "webhook key not configured") throw new RelayError("audience hook unavailable");
    throw err;
  }
  await audit(env, p, "app.audience_hook.set", appId, { appId });
  return result;
}

// Explicit fields: the secret is never read back, and a binding's name stays with the platform (a key never sees it).
export async function getAudienceHook(env: Env, p: Principal, appId: string) {
  await ownApp(env, p, appId);
  const hook = await clientFor(env, p.workspaceId).getAudienceHook(p.workspaceId, appId);
  if (!hook) return hook;
  const { kind, url, enabled } = hook;
  return p.keyId ? { kind, url, enabled } : { kind, url, binding: hook.binding, enabled };
}

export async function deleteAudienceHook(env: Env, p: Principal, appId: string): Promise<void> {
  await ownApp(env, p, appId);
  await guardBinding(env, p, appId);
  if (!(await clientFor(env, p.workspaceId).deleteAudienceHook(p.workspaceId, appId))) throw new RelayError("not found");
  await audit(env, p, "app.audience_hook.delete", appId, { appId });
}
