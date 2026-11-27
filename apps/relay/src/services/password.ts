import { and, eq, isNotNull } from "drizzle-orm";
import { securityDb } from "../db/security/client";
import { account } from "../db/security/schema";
import type { Env } from "../env";
import type { Session } from "./principal";

export async function hasPassword(env: Env, { userId }: Session): Promise<boolean> {
  const rows = await securityDb(env)
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential"), isNotNull(account.password)))
    .limit(1);
  return rows.length > 0;
}
