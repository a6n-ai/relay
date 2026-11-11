import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { resolveVisibleOrgIds } from "@foundry/auth";
import { db } from "@/db/client";
import { member, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export type WorkspaceScope = { mode: "all" } | { mode: "orgs"; orgIds: string[] };

/**
 * Which workspaces this session may see for a6n platform listings.
 * Uses `@foundry/auth` `resolveVisibleOrgIds`: `super_admin` → all, else memberships only.
 */
export async function resolveWorkspaceScope(): Promise<WorkspaceScope> {
  const session = await getSession();
  if (!session?.user) return { mode: "orgs", orgIds: [] };

  const [row] = await db
    .select({ id: users.id, platformRole: users.platformRole })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);
  if (!row) return { mode: "orgs", orgIds: [] };

  const memberships = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, row.id));

  const visible = resolveVisibleOrgIds({
    platformRole: row.platformRole ?? session.user.platformRole,
    memberOrgIds: memberships.map((m) => m.organizationId),
  });

  if (visible === "all") return { mode: "all" };
  return { mode: "orgs", orgIds: visible };
}

export async function requirePlatformAdmin(): Promise<void> {
  const scope = await resolveWorkspaceScope();
  if (scope.mode !== "all") redirect("/dashboard");
}

/** True when the signed-in user is a6n platform staff (`super_admin`). */
export async function isPlatformAdmin(): Promise<boolean> {
  const session = await getSession();
  return session?.user.platformRole === "super_admin";
}
