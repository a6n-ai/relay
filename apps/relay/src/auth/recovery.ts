import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { securityDb } from "../db/security/client";
import { invitation, user } from "../db/security/schema";
import type { Env } from "../env";

// A personal mailbox is not readable until sign-in works, so its codes go to the recovery email.
export async function deliveryEmail(env: Env, email: string): Promise<string> {
  const e = email.trim().toLowerCase();
  const db = securityDb(env);
  const [u] = await db.select({ recoveryEmail: user.recoveryEmail }).from(user).where(eq(user.email, e));
  if (u?.recoveryEmail) return u.recoveryEmail;
  const [inv] = await db
    .select({ recoveryEmail: invitation.recoveryEmail })
    .from(invitation)
    .where(and(eq(invitation.email, e), eq(invitation.status, "pending"), gt(invitation.expiresAt, new Date()), isNotNull(invitation.recoveryEmail)))
    .orderBy(desc(invitation.createdAt))
    .limit(1);
  return inv?.recoveryEmail ?? e;
}
