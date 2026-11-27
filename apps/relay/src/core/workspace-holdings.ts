import { count, eq } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { address, sendingDomain } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { app } from "../db/security/schema";
import type { Env } from "../env";

// What a workspace still owns that its delete must not orphan. Addresses and domains live in relay-core, so no foreign key guards them.
export async function workspaceHoldings(env: Env, workspaceId: string): Promise<{ apps: number; addresses: number; domains: number }> {
  const [[apps], [addresses], [domains]] = await Promise.all([
    securityDb(env).select({ n: count() }).from(app).where(eq(app.workspaceId, workspaceId)),
    coreDb(env).select({ n: count() }).from(address).where(eq(address.workspaceId, workspaceId)),
    coreDb(env).select({ n: count() }).from(sendingDomain).where(eq(sendingDomain.workspaceId, workspaceId)),
  ]);
  return { apps: apps.n, addresses: addresses.n, domains: domains.n };
}
