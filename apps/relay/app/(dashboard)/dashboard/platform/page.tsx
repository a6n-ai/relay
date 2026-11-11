import { Building2Icon } from "lucide-react";
import { asc, count, inArray } from "drizzle-orm";
import { PageShell } from "@foundry/design-system";
import { CreateDialog } from "@/components/ds/create-dialog";
import { EmptyState } from "@/components/ds/empty-state";
import { ViewHeader } from "@/components/ds/view-header";
import { db } from "@/db/client";
import { member, organization, tenants } from "@/db/schema";
import { getActiveOrganizationId } from "@/lib/auth/active-org";
import { requirePlatformAdmin } from "@/lib/auth/org-scope";
import { countOrganizationSendsThisMonth } from "@/lib/tenants/usage";
import { ClientsTable } from "./clients-table";
import { CreateClientForm } from "./create-client-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Clients" };

function formatQuota(n: number) {
  return n === 0 ? "unlimited" : n.toLocaleString("en");
}

export default async function PlatformClientsPage() {
  await requirePlatformAdmin();
  const activeId = await getActiveOrganizationId();
  const orgs = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      monthlyMessageQuota: organization.monthlyMessageQuota,
      maxApps: organization.maxApps,
    })
    .from(organization)
    .orderBy(asc(organization.name));

  const orgIds = orgs.map((o) => o.id);
  const appCounts = new Map<string, number>();
  const memberCounts = new Map<string, number>();
  if (orgIds.length > 0) {
    const [appRows, memberRows] = await Promise.all([
      db
        .select({ organizationId: tenants.organizationId, n: count() })
        .from(tenants)
        .where(inArray(tenants.organizationId, orgIds))
        .groupBy(tenants.organizationId),
      db
        .select({ organizationId: member.organizationId, n: count() })
        .from(member)
        .where(inArray(member.organizationId, orgIds))
        .groupBy(member.organizationId),
    ]);
    for (const row of appRows) {
      if (row.organizationId) appCounts.set(row.organizationId, Number(row.n) || 0);
    }
    for (const row of memberRows) {
      memberCounts.set(row.organizationId, Number(row.n) || 0);
    }
  }

  const usage = await Promise.all(
    orgs.map(async (o) => [o.id, await countOrganizationSendsThisMonth(o.id)] as const),
  );
  const usedByOrg = new Map(usage);

  const create = (pill: boolean) => (
    <CreateDialog
      label="New client"
      description="A workspace with its own apps, people, and send limits."
      pill={pill}
    >
      <CreateClientForm />
    </CreateDialog>
  );

  const clients = orgs.map((o) => {
    const apps = appCounts.get(o.id) ?? 0;
    const people = memberCounts.get(o.id) ?? 0;
    const used = usedByOrg.get(o.id) ?? 0;
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      isCurrent: o.id === activeId,
      meta: `${o.slug} · ${used.toLocaleString("en")} / ${formatQuota(o.monthlyMessageQuota)} sends · ${apps}/${formatQuota(o.maxApps)} apps · ${people} people`,
    };
  });

  return (
    <PageShell>
      <ViewHeader
        title="Clients"
        subtitle="Every workspace on Relay. Limits apply across that client’s apps. Your current workspace is marked below."
        actions={create(false)}
        section="organization"
      />
      {clients.length === 0 ? (
        <EmptyState
          icon={Building2Icon}
          title="No clients yet"
          lines={["Add a client to give a team its own workspace.", "Seed creates a6n for local ops."]}
          action={create(true)}
        />
      ) : (
        <ClientsTable clients={clients} emptyAction={create(true)} />
      )}
    </PageShell>
  );
}
