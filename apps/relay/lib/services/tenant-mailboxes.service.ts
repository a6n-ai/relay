import { eq } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { tenantMailboxes } from "@/db/schema";
import { planNewMailbox } from "@/lib/mailbox/create-mailbox";
import { emailSendersService } from "./email-senders.service";
import { SessionUpdatableService } from "./session-service";

class TenantMailboxesService extends SessionUpdatableService<typeof tenantMailboxes> {
  async forTenant(tenantId: bigint) {
    const page = await this.list(eq("tenantId", tenantId), {
      page: 0,
      size: 100,
      sort: { field: "createdAt", dir: "desc" },
    });
    return page.items;
  }

  async createForTenant(input: {
    tenantId: bigint;
    localPart: string;
    domain: string;
    kind?: string | null;
    seatQuota: number;
    verifiedSendingDomains: readonly string[];
  }) {
    const existing = await this.forTenant(input.tenantId);
    const planned = planNewMailbox({
      localPart: input.localPart,
      domain: input.domain,
      kind: input.kind,
      existingCount: existing.length,
      seatQuota: input.seatQuota,
      verifiedSendingDomains: input.verifiedSendingDomains,
    });
    if ("error" in planned) return planned;
    let row;
    try {
      row = await this.create({
        tenantId: input.tenantId,
        localPart: planned.localPart,
        domain: planned.domain,
        email: planned.email,
        kind: planned.kind,
      });
    } catch {
      return { error: "That address is already in use" };
    }
    if (planned.createSender) {
      try {
        await emailSendersService.createForTenant({
          tenantId: input.tenantId,
          email: planned.email,
          displayName: null,
        });
      } catch {
        /* already a From */
      }
    }
    return { row };
  }
}

export const tenantMailboxesService = new TenantMailboxesService(
  new UpdatableRepository(db, tenantMailboxes, tenantMailboxes.publicId, tenantMailboxes.id),
);
