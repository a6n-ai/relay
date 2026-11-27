import type { Env } from "../env";
import { writeAudit } from "../auth/audit";
import { RelayError } from "../shared/errors";
import type { OrgRole } from "../shared/roles";

// Who is acting: a console user (userId, roles) or an API key (keyId, pinned to one app). The transport checks permission and suspension, then builds this once.
export type Principal = {
  workspaceId: string;
  appId: string | null;
  userId: string | null;
  keyId: string | null;
  platformAdmin?: boolean;
  roles?: OrgRole[];
  workspaceStatus?: "active" | "suspended";
};

// A signed-in user before any workspace is chosen (shell, invite, create workspace, password). The headers carry the cookie for better-auth calls.
export type Session = { headers: Headers; userId: string; platformAdmin: boolean; activeWorkspaceId: string | null };

// An API key reaches one app, so these two are always set.
export type KeyPrincipal = Principal & { appId: string; keyId: string };

export const audit = (env: Env, p: Principal, action: string, target: string, data?: Record<string, unknown>) =>
  writeAudit(env, {
    action,
    actorUserId: p.userId,
    workspaceId: p.workspaceId,
    target,
    data: p.keyId ? { ...data, keyId: p.keyId } : data,
  });

// A row of another app is a 404, the same as a missing one. A console principal has no app, so any row of the workspace passes.
export function owned<T extends { appId: string }>(p: Principal, row: T | null): T {
  if (!row || (p.appId !== null && row.appId !== p.appId)) throw new RelayError("not found");
  return row;
}
