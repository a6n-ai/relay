import { desc } from "drizzle-orm";
import { KeyIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
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
      <ul className="space-y-3">
        {list.map((t) => {
          const tKeys = keys.filter((k) => k.tenantId === t.id);
          return (
            <li key={t.publicId} className="rounded-md border p-4">
              <div className="font-medium">{t.name}</div>
              <div className="text-muted-foreground text-sm">
                {t.slug} · {t.mailingCountry}
                {t.physicalAddress ? ` · ${t.physicalAddress}` : ""}
              </div>
              <ul className="mt-2 text-sm">
                {tKeys.map((k) => (
                  <li key={k.publicId}>
                    {k.name}: <code>{k.keyPrefix}…</code>
                    {k.revokedAt ? " (revoked)" : ""}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
