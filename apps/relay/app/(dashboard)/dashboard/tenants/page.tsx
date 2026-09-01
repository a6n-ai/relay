import { desc } from "drizzle-orm";
import { KeyIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { db } from "@/db/client";
import { apiKeys, tenants } from "@/db/schema";
import { CreateTenantForm } from "./create-tenant-form";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const list = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
  const keys = await db.select().from(apiKeys);

  return (
    <PageShell>
      <PageHeader
        icon={KeyIcon}
        title="Tenants"
        subtitle="Realm apps are tenants with API keys. Operators sign in here; apps call POST /v1/messages."
      />
      <SectionCard title="New tenant" subtitle="Issues a one-time API secret. Stamp created_by from the operator session.">
        <CreateTenantForm />
      </SectionCard>
      {list.length === 0 ? (
        <EmptyState icon={KeyIcon} message="No tenants yet." />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((t) => {
            const tKeys = keys.filter((k) => k.tenantId === t.id);
            return (
              <SectionCard
                key={t.publicId}
                title={t.name}
                subtitle={`${t.slug} · ${t.mailingCountry}${t.physicalAddress ? ` · ${t.physicalAddress}` : ""}`}
                variant="flat"
              >
                {tKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No keys yet.</p>
                ) : (
                  tKeys.map((k) => (
                    <div key={k.publicId} className="flex items-center gap-2 text-sm">
                      <span>{k.name}</span>
                      <code className="text-xs">{k.keyPrefix}…</code>
                      {k.revokedAt ? (
                        <Badge variant="destructive">Revoked</Badge>
                      ) : (
                        <Badge variant="secondary">Live</Badge>
                      )}
                    </div>
                  ))
                )}
              </SectionCard>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
