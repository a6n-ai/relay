import { setResponseStatus } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { securityDb } from "../db/security/client";
import { member, workspace } from "../db/security/schema";
import type { Env } from "../env";
import { createAuth } from "../lib/auth";
import { allows, orgRoles } from "../lib/auth/permissions";

export type OrgRole = "owner" | "admin" | "member" | "billing";
export type ConsoleActor = {
  userId: string;
  platformAdmin: boolean;
  workspaceId: string;
  roles: OrgRole[];
  workspaceStatus: "active" | "suspended";
};

export class ConsoleError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429,
    message: string,
  ) {
    super(message);
  }
}

// The cookie cache can hold a role or suspension decision from before a change, so the session is read from the database.
export async function requireSession(
  env: Env,
  headers: Headers,
): Promise<{ userId: string; platformAdmin: boolean; activeWorkspaceId: string | null }> {
  const session = await createAuth(env).api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session) throw new ConsoleError(401, "unauthorized");
  return {
    userId: session.user.id,
    platformAdmin: session.user.role === "admin",
    activeWorkspaceId: session.session.activeOrganizationId ?? null,
  };
}

const isOrgRole = (role: string): role is OrgRole => role in orgRoles;
export const parseRoles = (raw: string): OrgRole[] => raw.split(",").map((r) => r.trim()).filter(isOrgRole);

export async function requireActor(
  env: Env,
  headers: Headers,
  need: { permission?: Record<string, string[]>; write?: boolean } = {},
): Promise<ConsoleActor> {
  const { userId, platformAdmin, activeWorkspaceId } = await requireSession(env, headers);
  if (!activeWorkspaceId) throw new ConsoleError(403, "no workspace");

  const [row] = await securityDb(env)
    .select({ role: member.role, status: workspace.status })
    .from(member)
    .innerJoin(workspace, eq(workspace.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(member.organizationId, activeWorkspaceId)));
  if (!row) throw new ConsoleError(403, "not a member");

  const roles = parseRoles(row.role);
  const permission = need.permission;
  if (permission && !allows(roles, permission)) {
    throw new ConsoleError(403, "forbidden");
  }

  if (need.write) {
    assertSameOrigin(env, headers);
    if (row.status === "suspended") throw new ConsoleError(403, "workspace suspended");
  }

  return { userId, platformAdmin, workspaceId: activeWorkspaceId, roles, workspaceStatus: row.status };
}

export function assertSameOrigin(env: Env, headers: Headers): void {
  const origin = headers.get("origin");
  if (origin !== null && origin !== new URL(env.BETTER_AUTH_URL).origin) {
    throw new ConsoleError(403, "cross-origin write");
  }
}

export async function requirePlatformAdmin(
  env: Env,
  headers: Headers,
  { write = false }: { write?: boolean } = {},
): Promise<{ userId: string }> {
  const { userId, platformAdmin } = await requireSession(env, headers);
  if (!platformAdmin) throw new ConsoleError(404, "not found");
  if (write) assertSameOrigin(env, headers);
  return { userId };
}

// Server functions call this from their catch: known errors keep their status and message, anything else is a 500 with no detail.
export function toResponseError(err: unknown): never {
  if (err instanceof ConsoleError) {
    setResponseStatus(err.status);
    throw new Error(err.message);
  }
  console.error("console handler failed", err instanceof Error ? err.name : "unknown");
  setResponseStatus(500);
  throw new Error("internal error");
}
