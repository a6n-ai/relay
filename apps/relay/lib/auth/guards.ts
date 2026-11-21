import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ForbiddenError } from "@foundry/commons";
import { createRoleGuards } from "@foundry/auth";
import { db } from "@/db/client";
import { member } from "@/db/schema";
import { auth } from "./index";
import { getFreshSession } from "./session";

const { requireRole } = createRoleGuards(getFreshSession);

/** The caller's member row in the active workspace. Reads the DB each request so a suspension applies at once. */
export const activeMember = cache(async () => {
  const s = await auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
  const organizationId = (s?.session as { activeOrganizationId?: string | null } | undefined)?.activeOrganizationId;
  if (!s?.user || !organizationId) return null;
  const [row] = await db
    .select({
      id: member.id,
      organizationId: member.organizationId,
      role: member.role,
      status: member.status,
    })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, BigInt(s.user.id))))
    .limit(1);
  return row ?? null;
});

async function allowed(perms: Record<string, string[]>): Promise<boolean> {
  const m = await activeMember();
  if (!m || m.status !== "active") return false;
  const res = await auth.api.hasPermission({
    headers: await headers(),
    body: { permissions: perms, organizationId: m.organizationId },
  });
  return res.success === true;
}

export async function requirePermission(perms: Record<string, string[]>): Promise<void> {
  if (!(await allowed(perms))) throw new ForbiddenError();
}

export function can(perms: Record<string, string[]>): Promise<boolean> {
  return allowed(perms);
}

/** Relay has no "no access" page: a 404 also hides that the page exists. */
export async function requirePagePermission(perms: Record<string, string[]>): Promise<void> {
  if (!(await allowed(perms))) notFound();
}

export { requireRole };
