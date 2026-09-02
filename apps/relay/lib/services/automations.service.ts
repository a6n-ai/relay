import { and, eq } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { listAutomation } from "@/db/schema";
import { contactListMembersService, contactListsService } from "./campaigns.service";
import { SessionUpdatableService } from "./session-service";
import { tenantsService } from "./tenants.service";

class ListAutomationsService extends SessionUpdatableService<typeof listAutomation> {
  async createRule(input: {
    tenantPublicId: string;
    name: string;
    triggerEvent: string;
    listPublicId: string;
  }) {
    const tenant = await tenantsService.read(input.tenantPublicId);
    const list = await contactListsService.read(input.listPublicId);
    return this.create({
      tenantId: tenant.id,
      name: input.name,
      triggerEvent: input.triggerEvent,
      listId: list.id,
    });
  }

  async matching(tenantId: bigint, triggerEvent: string) {
    const page = await this.list(
      and(
        eq("tenantId", tenantId),
        eq("triggerEvent", triggerEvent),
        eq("enabled", true),
      ),
      { page: 0, size: 100 },
    );
    return page.items;
  }
}

export const listAutomationsService = new ListAutomationsService(
  new UpdatableRepository(db, listAutomation, listAutomation.publicId, listAutomation.id),
);

export async function applyListAutomations(input: {
  tenantId: bigint;
  event?: string;
  email?: string;
  phone?: string;
  name?: string;
}): Promise<void> {
  if (!input.event) return;
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  if (!email && !phone) return;

  const rules = await listAutomationsService.matching(input.tenantId, input.event);
  for (const rule of rules) {
    await contactListMembersService.addUnique({
      listId: rule.listId,
      email,
      phone,
      name: input.name ?? null,
    });
    await contactListsService.recount(rule.listId);
  }
}
