import { and, eq } from "drizzle-orm";
import { securityDb } from "../db/security/client";
import { member, workspace } from "../db/security/schema";
import type { Env } from "../env";
import { allows } from "../shared/permissions";
import { assertSameOrigin, parseRoles, requireSession } from "../auth/session";
import type { Principal } from "../services/principal";
import { RelayError } from "../shared/errors";
import type { Need } from "./needs";

export async function requireActor(
  env: Env,
  headers: Headers,
  need: Need = {},
): Promise<Principal> {
  const { userId, platformAdmin, activeWorkspaceId } = await requireSession(env, headers);
  if (!activeWorkspaceId) throw new RelayError("no workspace");

  const [row] = await securityDb(env)
    .select({ role: member.role, status: workspace.status })
    .from(member)
    .innerJoin(workspace, eq(workspace.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(member.organizationId, activeWorkspaceId)));
  if (!row) throw new RelayError("not a member");

  const roles = parseRoles(row.role);
  const permission = need.permission;
  if (permission && !allows(roles, permission)) {
    throw new RelayError("forbidden");
  }

  if (need.write) {
    assertSameOrigin(env, headers);
    if (row.status === "suspended") throw new RelayError("workspace suspended");
  }

  return { userId, platformAdmin, workspaceId: activeWorkspaceId, appId: null, keyId: null, roles, workspaceStatus: row.status };
}

export async function requirePlatformAdmin(
  env: Env,
  headers: Headers,
  { write = false }: { write?: boolean } = {},
): Promise<{ userId: string }> {
  const { userId, platformAdmin } = await requireSession(env, headers);
  if (!platformAdmin) throw new RelayError("not found");
  if (write) assertSameOrigin(env, headers);
  return { userId };
}
