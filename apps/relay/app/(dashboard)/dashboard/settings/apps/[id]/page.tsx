import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { SettingsPage } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { UpdateQuotaForm } from "@/app/(dashboard)/dashboard/tenants/tenant-ops-forms";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { appMessageTagsService } from "@/lib/services/mailbox-tags.service";
import { tenantMailboxesService } from "@/lib/services/tenant-mailboxes.service";
import { loadAppSettings } from "@/lib/tenants/load-app-settings";
import { countTenantSendsThisMonth } from "@/lib/tenants/usage";

export const dynamic = "force-dynamic";

export default async function AppGeneralPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission({ tenant: ["read"] });
  const app = await loadAppSettings((await params).id);
  if (!app) notFound();
  const { tenant } = app;

  const [used, allBoxes, tags, canWrite] = await Promise.all([
    countTenantSendsThisMonth(tenant.id),
    tenantMailboxesService.forTenant(tenant.id),
    appMessageTagsService.forTenant(tenant.id),
    can({ tenant: ["write"] }),
  ]);

  return (
    <PageShell>
      <ViewHeader title={tenant.name} />
      <SettingsPage title={tenant.name} subtitle="General">
        <SectionCard title="Monthly send limit" subtitle="0 means no cap. Counts messages started this calendar month (UTC).">
          <p className="mb-3 text-sm">Sent {used.toLocaleString("en")} of {tenant.monthlyMessageQuota === 0 ? "unlimited" : tenant.monthlyMessageQuota.toLocaleString("en")} · {allBoxes.length} of {tenant.mailboxSeatQuota === 0 ? "unlimited" : tenant.mailboxSeatQuota.toLocaleString("en")} addresses</p>
          {canWrite ? (
            <UpdateQuotaForm publicId={tenant.publicId} quota={tenant.monthlyMessageQuota} seatQuota={tenant.mailboxSeatQuota} />
          ) : null}
        </SectionCard>
        <SectionCard
          title="Tags"
          subtitle="A tag here marks every message for this app. Add or remove them under Tags."
        >
          <ul className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <li key={t.publicId}>
                <Badge variant="outline">{t.label}</Badge>
              </li>
            ))}
          </ul>
          {tags.length === 0 ? (
            <p className="text-muted-foreground text-sm">None yet.</p>
          ) : null}
          <Link className="mt-3 inline-block text-sm underline underline-offset-2" href="/dashboard/settings/tags" prefetch={false}>
            Open tags
          </Link>
        </SectionCard>
      </SettingsPage>
    </PageShell>
  );
}
