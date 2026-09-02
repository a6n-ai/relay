import { AppError, eq } from "@foundry/commons";
import { BaseRepository, UpdatableRepository } from "@foundry/database";
import type { AudienceDef } from "@relay/engine";
import { setCampaignContent, type SetCampaignContentInput } from "@relay/engine";
import { db } from "@/db/client";
import { campaign, campaignContent, contactList, contactListMember } from "@/db/schema";
import { operatorCampaignDeps } from "@/lib/campaigns/deps";
import { campaignTenantsService } from "./campaign-tenants.service";
import { SessionBaseService, SessionUpdatableService } from "./session-service";
import { tenantsService } from "./tenants.service";

class CampaignsService extends SessionUpdatableService<typeof campaign> {
  async createForTenant(input: {
    tenantPublicId: string;
    name: string;
    channels: string[];
    audience: AudienceDef;
    scheduledAt?: number | null;
  }) {
    const tenant = await tenantsService.read(input.tenantPublicId);
    const row = await this.create({
      name: input.name,
      channels: input.channels,
      audience: input.audience,
      status: input.scheduledAt ? "scheduled" : "draft",
      scheduledAt: input.scheduledAt ?? null,
    });
    await campaignTenantsService.bind(row.id, tenant.id);
    return row;
  }

  async tenantForCampaign(campaignId: bigint) {
    const binding = await campaignTenantsService.forCampaignId(campaignId);
    if (!binding) return null;
    return tenantsService.findById(binding.tenantId);
  }
}

class CampaignContentService extends SessionUpdatableService<typeof campaignContent> {
  async saveForCampaign(campaignPublicId: string, input: SetCampaignContentInput) {
    const result = await setCampaignContent(operatorCampaignDeps(), campaignPublicId, input);
    if ("error" in result) throw new AppError(result.error, result.status);
    return result;
  }

  async forCampaignId(campaignId: bigint) {
    const page = await this.list(eq("campaignId", campaignId), { page: 0, size: 20 });
    return page.items[0] ?? null;
  }
}

class ContactListsService extends SessionUpdatableService<typeof contactList> {
  async recount(listId: bigint) {
    const list = await this.findById(listId);
    if (!list) return;
    const page = await contactListMembersService.list(eq("listId", listId), { page: 0, size: 1 });
    await this.update(list.publicId, { memberCount: page.total });
  }
}

class ContactListMembersService extends SessionBaseService<typeof contactListMember> {
  async addUnique(values: {
    listId: bigint;
    email: string | null;
    phone: string | null;
    name: string | null;
  }) {
    await db
      .insert(contactListMember)
      .values({ ...values, vars: {} })
      .onConflictDoNothing();
  }
}

export const campaignsService = new CampaignsService(
  new UpdatableRepository(db, campaign, campaign.publicId, campaign.id),
);

export const campaignContentService = new CampaignContentService(
  new UpdatableRepository(db, campaignContent, campaignContent.publicId, campaignContent.id),
);

export const contactListsService = new ContactListsService(
  new UpdatableRepository(db, contactList, contactList.publicId, contactList.id),
);

export const contactListMembersService = new ContactListMembersService(
  new BaseRepository(db, contactListMember, contactListMember.publicId, contactListMember.id),
);
