import { and, eq, NotFoundError } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { count, eq as drizzleEq } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys, EMAIL_API_CHANNEL, organization, tenants } from "@/db/schema";
import { redactFields } from "@/lib/audit/redact";
import { generateApiKey } from "@/lib/api-keys";
import { requireActiveOrganizationId } from "@/lib/auth/active-org";
import { SessionUpdatableService } from "./session-service";

class TenantsService extends SessionUpdatableService<typeof tenants> {
  async findBySlug(slug: string) {
    const organizationId = await requireActiveOrganizationId();
    const page = await this.list(and(eq("organizationId", organizationId), eq("slug", slug)), { page: 0, size: 1 });
    return page.items[0] ?? null;
  }

  /** Another workspace's app reads as not found, the same as a missing one. */
  async read(publicId: string) {
    const tenant = await super.read(publicId);
    if (tenant.organizationId !== (await requireActiveOrganizationId())) {
      throw new NotFoundError(`Not found: ${publicId}`);
    }
    return tenant;
  }

  async update(publicId: string, patch: Record<string, unknown>): Promise<(typeof tenants)["$inferSelect"]> {
    await this.read(publicId);
    return super.update(publicId, patch);
  }

  async delete(publicId: string): Promise<number> {
    await this.read(publicId);
    return super.delete(publicId);
  }

  /** Apps for the session's active workspace only. */
  async listRecent(condition?: Parameters<TenantsService["list"]>[0], size = 200) {
    const organizationId = await requireActiveOrganizationId();
    const scoped = eq("organizationId", organizationId);
    return this.list(condition ? and(scoped, condition) : scoped, {
      page: 0,
      size,
      sort: { field: "createdAt", dir: "desc" },
    });
  }

  async create(values: Record<string, unknown>) {
    const organizationId = await requireActiveOrganizationId();
    const [org] = await db
      .select({ maxApps: organization.maxApps })
      .from(organization)
      .where(drizzleEq(organization.id, organizationId))
      .limit(1);
    if (org && org.maxApps > 0) {
      const [row] = await db
        .select({ n: count() })
        .from(tenants)
        .where(drizzleEq(tenants.organizationId, organizationId));
      if ((row?.n ?? 0) >= org.maxApps) {
        throw new Error("This workspace has reached its app limit.");
      }
    }
    return super.create({ ...values, organizationId });
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
