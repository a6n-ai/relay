import { eq } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { campaignTenant } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

class CampaignTenantsService extends SessionUpdatableService<typeof campaignTenant> {
  async forCampaignId(campaignId: bigint) {
    const page = await this.list(eq("campaignId", campaignId), { page: 0, size: 1 });
    return page.items[0] ?? null;
  }

  /** One tenant per campaign. Re-bind updates the existing row so uniqueness holds. */
  async bind(campaignId: bigint, tenantId: bigint) {
    const existing = await this.forCampaignId(campaignId);
    if (existing) {
      if (existing.tenantId === tenantId) return existing;
      return this.update(existing.publicId, { tenantId });
    }
    return this.create({ campaignId, tenantId });
  }
}

export const campaignTenantsService = new CampaignTenantsService(
  new UpdatableRepository(db, campaignTenant, campaignTenant.publicId, campaignTenant.id),
);
