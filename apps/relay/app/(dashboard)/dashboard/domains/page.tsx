import { desc } from "drizzle-orm";
import { GlobeIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { buildSendingDomainRecords } from "@relay/email";
import { db } from "@/db/client";
import { sendingDomains, tenants } from "@/db/schema";
import { AddDomainForm, VerifyDomainButton } from "./domain-forms";

export const dynamic = "force-dynamic";

export default async function DomainsPage() {
  const tenantRows = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
  const domains = await db.select().from(sendingDomains).orderBy(desc(sendingDomains.createdAt));

  return (
    <PageShell>
      <PageHeader
        icon={GlobeIcon}
        title="Sending domains"
        subtitle="Authenticate the From domain before bulk or Gmail/Yahoo mail. Ownership TXT is the gate; SPF, DKIM, and DMARC are what inboxes score."
      />
      {tenantRows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Create a tenant first.</p>
      ) : (
        <SectionCard title="Add domain">
          <AddDomainForm slugs={tenantRows.map((t) => t.slug)} />
        </SectionCard>
      )}
      <ul className="space-y-4">
        {domains.map((d) => {
          const tenant = tenantRows.find((t) => t.id === d.tenantId);
          const records = buildSendingDomainRecords({
            domain: d.domain,
            token: d.verifyToken,
            dkimSelector: d.dkimSelector,
            dkimP: d.dkimPublic ?? undefined,
            spfInclude: d.spfInclude ?? undefined,
          });
          return (
            <li key={d.publicId} className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{d.domain}</div>
                  <div className="text-muted-foreground text-sm">
                    {tenant?.slug ?? "tenant"} · {d.status}
                    {d.lastError ? ` · ${d.lastError}` : ""}
                  </div>
                </div>
                <VerifyDomainButton publicId={d.publicId} />
              </div>
              <table className="mt-3 w-full text-left text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-1 pr-2">Type</th>
                    <th className="py-1 pr-2">Host</th>
                    <th className="py-1">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={`${r.purpose}-${r.host}`} className="align-top">
                      <td className="py-1 pr-2 font-mono">{r.type}</td>
                      <td className="py-1 pr-2 font-mono">{r.host}</td>
                      <td className="py-1 break-all font-mono">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </li>
          );
        })}
        {domains.length === 0 ? <li className="text-muted-foreground text-sm">No domains yet.</li> : null}
      </ul>
    </PageShell>
  );
}
