import { and, eq } from "@foundry/commons";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { tenantEmailSenders } from "@/db/schema";
import { domainOf } from "@/lib/email/sender-domain";
import { sendingDomainsService } from "./sending.service";
import { SessionUpdatableService } from "./session-service";

class EmailSendersService extends SessionUpdatableService<typeof tenantEmailSenders> {
  async forTenant(tenantId: bigint) {
    const page = await this.list(eq("tenantId", tenantId), {
      page: 0,
      size: 50,
      sort: { field: "createdAt", dir: "desc" },
    });
    return page.items;
  }

  async verifiedForTenant(tenantId: bigint) {
    const rows = await this.forTenant(tenantId);
    return rows.filter((r) => r.verifiedAt != null);
  }

  async createForTenant(input: {
    tenantId: bigint;
    email: string;
    displayName: string | null;
  }) {
    const email = input.email.trim().toLowerCase();
    const domain = domainOf(email);
    const verifiedAt = domain && (await domainVerifiedForTenant(input.tenantId, domain))
      ? Date.now()
      : null;
    return this.create({
      tenantId: input.tenantId,
      email,
      displayName: input.displayName,
      verifiedAt,
    });
  }

  async refreshVerification(tenantId: bigint) {
    const rows = await this.forTenant(tenantId);
    for (const row of rows) {
      const domain = domainOf(row.email);
      const ok = domain ? await domainVerifiedForTenant(tenantId, domain) : false;
      const next = ok ? (row.verifiedAt ?? Date.now()) : null;
      if (next !== row.verifiedAt) {
        await this.update(row.publicId, { verifiedAt: next });
      }
    }
  }
}

async function domainVerifiedForTenant(tenantId: bigint, domain: string): Promise<boolean> {
  const page = await sendingDomainsService.list(
    and(eq("tenantId", tenantId), eq("domain", domain), eq("status", "verified")),
    { page: 0, size: 1 },
  );
  return page.items.length > 0;
}

export const emailSendersService = new EmailSendersService(
  new UpdatableRepository(db, tenantEmailSenders, tenantEmailSenders.publicId, tenantEmailSenders.id),
);
