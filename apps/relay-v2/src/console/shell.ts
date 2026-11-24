import { asc, eq } from "drizzle-orm";
import { securityDb } from "../db/security/client";
import { member, user, workspace } from "../db/security/schema";
import type { Env } from "../env";
import { createAuth } from "../lib/auth";
import { type OrgRole, parseRoles, requireSession } from "./actor";

export type Shell = {
  user: { id: string; email: string; name: string };
  platformAdmin: boolean;
  active: { id: string; name: string; status: "active" | "suspended"; roles: OrgRole[] } | null;
  workspaces: { id: string; name: string }[];
};

// A stale active workspace (removed member, or none yet) moves to the first membership; its set-cookie goes to setCookies.
export async function loadShell(env: Env, headers: Headers, setCookies: string[] = []): Promise<Shell> {
  const { userId, platformAdmin, activeWorkspaceId } = await requireSession(env, headers);
  const db = securityDb(env);
  const [u] = await db.select({ id: user.id, email: user.email, name: user.name }).from(user).where(eq(user.id, userId));
  const memberships = await db
    .select({ id: workspace.id, name: workspace.name, status: workspace.status, role: member.role })
    .from(member)
    .innerJoin(workspace, eq(workspace.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));

  let current = memberships.find((m) => m.id === activeWorkspaceId) ?? null;
  if (!current && memberships.length > 0) {
    current = memberships[0];
    const { headers: authHeaders } = await createAuth(env).api.setActiveOrganization({
      headers,
      body: { organizationId: current.id },
      returnHeaders: true,
    });
    setCookies.push(...authHeaders.getSetCookie());
  }

  return {
    user: u,
    platformAdmin,
    active: current && { id: current.id, name: current.name, status: current.status, roles: parseRoles(current.role) },
    workspaces: memberships.map(({ id, name }) => ({ id, name })),
  };
}
