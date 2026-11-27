import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { RelayError } from "../shared/errors";
import type { KeyScope } from "../shared/scope";
import { getApp } from "./apps";

// Who is acting: a console user (userId) or an API key (keyId, pinned to one app). Permission and suspension are checked by the transport.
export type Principal = { workspaceId: string; appId: string | null; userId: string | null; keyId: string | null };

export const fromActor = (a: { workspaceId: string; userId: string }): Principal => ({
  workspaceId: a.workspaceId,
  appId: null,
  userId: a.userId,
  keyId: null,
});

export const fromScope = (s: KeyScope): Principal => ({ workspaceId: s.workspaceId, appId: s.appId, userId: null, keyId: s.keyId });

export const audit = (env: Env, p: Principal, action: string, target: string, data?: Record<string, unknown>) =>
  writeAudit(env, {
    action,
    actorUserId: p.userId,
    workspaceId: p.workspaceId,
    target,
    data: p.keyId ? { ...data, keyId: p.keyId } : data,
  });

// A key reaches only its own app; a console user reaches any app of the workspace.
export async function appFor(env: Env, p: Principal, appId: string): Promise<void> {
  if (p.appId !== null) {
    if (appId !== p.appId) throw new RelayError("not found");
    return;
  }
  await getApp(env, p, appId);
}

// A row of another app is a 404, the same as a missing one. A console principal has no app, so any row of the workspace passes.
export function owned<T extends { appId: string }>(p: Principal, row: T | null): T {
  if (!row || (p.appId !== null && row.appId !== p.appId)) throw new RelayError("not found");
  return row;
}

// The app a key is pinned to. Console principals name the app per call.
export function keyApp(p: Principal): string {
  if (p.appId === null) throw new RelayError("forbidden");
  return p.appId;
}
