import { UpdatableRepository } from "@foundry/database";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys, tenants } from "@/db/schema";
import { redactFields } from "@/lib/audit/redact";
import { generateApiKey } from "@/lib/api-keys";
import { SessionUpdatableService } from "./session-service";

class TenantsService extends SessionUpdatableService<typeof tenants> {
  async findBySlug(slug: string) {
    const [row] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    return row ?? null;
  }
}

class ApiKeysService extends SessionUpdatableService<typeof apiKeys> {
  protected redactChanges(
    changes: Record<string, { from: unknown; to: unknown }> | null,
  ): Record<string, { from: unknown; to: unknown }> | null {
    return redactFields(changes, ["keyHash"]);
  }
}

export const tenantsService = new TenantsService(
  new UpdatableRepository(db, tenants, tenants.publicId, tenants.id),
);

export const apiKeysService = new ApiKeysService(
  new UpdatableRepository(db, apiKeys, apiKeys.publicId, apiKeys.id),
);

export async function issueTenantApiKey(tenantId: bigint, name: string): Promise<string> {
  const key = generateApiKey();
  await apiKeysService.create({
    tenantId,
    name,
    keyPrefix: key.prefix,
    keyHash: key.hash,
  });
  return key.secret;
}
