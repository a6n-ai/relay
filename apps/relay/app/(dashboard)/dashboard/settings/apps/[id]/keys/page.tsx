import { notFound } from "next/navigation";
import { eq } from "@foundry/commons";
import { PageShell, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { SettingsPage } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { displayChannel } from "@/components/ds/plain-labels";
import { IssueKeyForm } from "@/app/(dashboard)/dashboard/tenants/tenant-ops-forms";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { apiKeysService } from "@/lib/services/tenants.service";
import { loadAppSettings } from "@/lib/tenants/load-app-settings";

export const dynamic = "force-dynamic";

export default async function AppKeysPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission({ tenant: ["read"] });
  const app = await loadAppSettings((await params).id);
  if (!app) notFound();
  const { tenant } = app;

  const [{ items: keys }, canWrite] = await Promise.all([
    apiKeysService.list(eq("tenantId", tenant.id), { page: 0, size: 50 }),
    can({ tenant: ["write"] }),
  ]);

  return (
    <PageShell>
      <ViewHeader title={tenant.name} />
      <SettingsPage title={tenant.name} subtitle="Access keys">
        <SectionCard title="Access keys" subtitle="Each key can send email. Other channels aren’t open yet.">
          {keys.map((k) => (
            <div key={k.publicId} className="flex flex-wrap items-center gap-2 text-sm">
              <span>{k.name}</span>
              <code className="text-xs">{k.keyPrefix}…</code>
              {(k.channels ?? []).map((ch) => (
                <Badge key={ch} variant="secondary">{displayChannel(ch)}</Badge>
              ))}
              {k.revokedAt ? <Badge variant="destructive">Revoked</Badge> : <Badge variant="secondary">Live</Badge>}
            </div>
          ))}
          {canWrite ? (
            <div className="mt-4">
              <IssueKeyForm publicId={tenant.publicId} />
            </div>
          ) : null}
        </SectionCard>
      </SettingsPage>
    </PageShell>
  );
}
