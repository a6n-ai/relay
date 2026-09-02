import { and, eq, isNull } from "drizzle-orm";
import type { Channel } from "@relay/engine";
import { apiKeys, tenants } from "@/db/schema";
import { db } from "@/db/client";
import { bearerToken, hashApiKey } from "@/lib/api-keys";

export type TenantAuth = {
  tenantId: bigint;
  slug: string;
  name: string;
  monthlyMessageQuota: number;
  channels: string[];
};

export async function authenticateTenant(req: Request): Promise<TenantAuth | null> {
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return null;
  const hash = hashApiKey(token);
  const [row] = await db
    .select({
      tenantId: apiKeys.tenantId,
      slug: tenants.slug,
      name: tenants.name,
      monthlyMessageQuota: tenants.monthlyMessageQuota,
      revokedAt: apiKeys.revokedAt,
      channels: apiKeys.channels,
    })
    .from(apiKeys)
    .innerJoin(tenants, eq(tenants.id, apiKeys.tenantId))
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  return {
    tenantId: row.tenantId,
    slug: row.slug,
    name: row.name,
    monthlyMessageQuota: row.monthlyMessageQuota,
    channels: row.channels ?? [],
  };
}

export function requestedChannels(input: { channels?: Channel[] }): Channel[] {
  return input.channels ?? ["email"];
}
