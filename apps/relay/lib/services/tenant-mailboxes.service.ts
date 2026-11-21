import { and, eq, inList } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { tenantMailboxes } from "@/db/schema";
import { domainOf } from "@/lib/email/sender-domain";
import { planNewMailbox } from "@/lib/mailbox/create-mailbox";
import { sendingDomainsService } from "./sending.service";
import { SessionUpdatableService } from "./session-service";

export type Mailbox = typeof tenantMailboxes.$inferSelect;

async function domainVerifiedForTenant(tenantId: bigint, domain: string): Promise<boolean> {
  const page = await sendingDomainsService.list(
    and(eq("tenantId", tenantId), eq("domain", domain), eq("status", "verified")),
    { page: 0, size: 1 },
  );
  return page.items.length > 0;
}

class TenantMailboxesService extends SessionUpdatableService<typeof tenantMailboxes> {
  async forTenant(tenantId: bigint) {
    const page = await this.list(eq("tenantId", tenantId), {
      page: 0,
      size: 100,
      sort: { field: "createdAt", dir: "desc" },
    });
    return page.items;
  }

  async sendersForTenant(tenantId: bigint): Promise<Mailbox[]> {
    const page = await this.list(and(eq("tenantId", tenantId), eq("canSend", true)), {
      page: 0,
      size: 50,
      sort: { field: "createdAt", dir: "desc" },
    });
    return page.items;
  }

  async verifiedSendersForTenant(tenantId: bigint): Promise<Mailbox[]> {
    const rows = await this.sendersForTenant(tenantId);
    return rows.filter((r) => r.verifiedAt != null);
  }

  async listSenders(tenantIds: bigint[]) {
    if (tenantIds.length === 0) return { items: [] };
    return this.listRecent(and(eq("canSend", true), inList("tenantId", tenantIds)));
  }

  async updateSending(
    publicId: string,
    input: { canSend: boolean; displayName: string | null },
  ): Promise<Mailbox | { error: string }> {
    const row = await this.read(publicId);
    if (input.canSend && row.kind === "people_inbox") {
      return { error: "People inboxes send from their own mail host" };
    }
    if (!input.canSend) return this.update(publicId, { canSend: false, displayName: input.displayName });
    const domain = domainOf(row.email);
    const verified = domain ? await domainVerifiedForTenant(row.tenantId, domain) : false;
    return this.update(publicId, {
      canSend: true,
      displayName: input.displayName,
      verifiedAt: verified ? Date.now() : null,
    });
  }

  async refreshVerification(tenantId: bigint): Promise<void> {
    const rows = await this.sendersForTenant(tenantId);
    for (const row of rows) {
      const domain = domainOf(row.email);
      const ok = domain ? await domainVerifiedForTenant(tenantId, domain) : false;
      const next = ok ? (row.verifiedAt ?? Date.now()) : null;
      if (next !== row.verifiedAt) {
        await this.update(row.publicId, { verifiedAt: next });
      }
    }
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
        canSend: planned.canSend,
        verifiedAt: input.verifiedSendingDomains.includes(planned.domain) ? Date.now() : null,
      });
    } catch {
      return { error: "That address is already in use" };
    }
    return { row };
  }
}

export const tenantMailboxesService = new TenantMailboxesService(
  new UpdatableRepository(db, tenantMailboxes, tenantMailboxes.publicId, tenantMailboxes.id),
);
