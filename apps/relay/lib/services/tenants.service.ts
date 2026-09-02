import { eq } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { apiKeys, EMAIL_API_CHANNEL, tenants } from "@/db/schema";
import { redactFields } from "@/lib/audit/redact";
import { generateApiKey } from "@/lib/api-keys";
import { SessionUpdatableService } from "./session-service";

class TenantsService extends SessionUpdatableService<typeof tenants> {
  async findBySlug(slug: string) {
    const page = await this.list(eq("slug", slug), { page: 0, size: 1 });
    return page.items[0] ?? null;
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

export async function issueTenantApiKey(
  tenantId: bigint,
  name: string,
  channels: string[] = [EMAIL_API_CHANNEL],
): Promise<string> {
  const key = generateApiKey();
  await apiKeysService.create({
    tenantId,
    name,
    keyPrefix: key.prefix,
    keyHash: key.hash,
    channels,
  });
  return key.secret;
}
