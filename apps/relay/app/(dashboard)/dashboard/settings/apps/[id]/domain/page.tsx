import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "@foundry/commons";
import { PageShell, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { buildSendingDomainRecords } from "@relay/email";
import { SettingsPage } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";
import { domainStatusLabel, fromSourceLabel } from "@/components/ds/plain-labels";
import { AddDomainForm, VerifyDomainButton } from "@/app/(dashboard)/dashboard/domains/domain-forms";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { loadEmailChannelSnapshot } from "@/lib/email/load-snapshot";
import { loadOperatorSmtpRow, resolveTenantEmailFrom } from "@/lib/email/from-address";
import { mailboxAccess, visibleMailboxes } from "@/lib/mailbox/access";
import { emailChannelReady, operatorEmailPrereqs } from "@/lib/email/prerequisites";
import { sendingDomainsService } from "@/lib/services/sending.service";
import { tenantMailboxesService } from "@/lib/services/tenant-mailboxes.service";
import { loadAppSettings } from "@/lib/tenants/load-app-settings";

export const dynamic = "force-dynamic";

export default async function AppDomainPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission({ tenant: ["read"] });
  const app = await loadAppSettings((await params).id);
  if (!app) notFound();
  const { tenant } = app;

  const [{ items: domains }, resolvedFrom, smtpRow, canSend, access, boxes] = await Promise.all([
    sendingDomainsService.list(eq("tenantId", tenant.id), { page: 0, size: 50 }),
    resolveTenantEmailFrom(tenant.id),
    loadOperatorSmtpRow(),
    can({ sending: ["write"] }),
    mailboxAccess(),
    tenantMailboxesService.forTenant(tenant.id),
  ]);
  // Members limited by mailbox grants only see a From that sits in a mailbox granted to them.
  const seen = new Set(visibleMailboxes(boxes, access).map((b) => b.email));
  const from = access === "all" || (resolvedFrom?.source === "tenant" && seen.has(resolvedFrom.email)) ? resolvedFrom : null;
  const fromHidden = resolvedFrom !== null && from === null;
  const verifiedCount = domains.filter((d) => d.status === "verified").length;
  const prereqs = operatorEmailPrereqs(
    await loadEmailChannelSnapshot(verifiedCount, smtpRow?.host ?? null),
  );
  const emailReady = emailChannelReady(prereqs) && verifiedCount > 0;

  return (
    <PageShell>
      <ViewHeader title={tenant.name} />
      <SettingsPage title={tenant.name} subtitle="Domain">
        <SectionCard title="Email" subtitle="The shared sending setup is under Email sending. This app still needs a proven domain.">
          <ul className="space-y-2 text-sm">
            {prereqs.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-2">
                <Badge variant={p.status === "ready" ? "secondary" : "destructive"}>
                  {p.status === "ready" ? "Ready" : "Needed"}
                </Badge>
                <span className="font-medium">{p.label}</span>
                <span className="text-muted-foreground">{p.detail}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            Who mail is from: {from ? `${from.email} (${fromSourceLabel(from.source)})` : fromHidden ? "set, but not one of your mailboxes" : "none. Set a default From or prove a sender"}
            {emailReady ? "" : " · Email isn’t fully ready"}
          </p>
          <Link className="mt-3 inline-block text-sm underline" href="/dashboard/settings/mailboxes">
            Manage mailboxes
          </Link>
        </SectionCard>
        <SectionCard title="Your domain" subtitle="Add the records at your domain host, then tap Check DNS.">
          {canSend ? <AddDomainForm slugs={[tenant.slug]} lockedSlug={tenant.slug} /> : null}
          <ul className="mt-4 space-y-4">
            {domains.map((d) => {
              const records = buildSendingDomainRecords({
                domain: d.domain,
                token: d.verifyToken,
                dkimSelector: d.dkimSelector,
                dkimP: d.dkimPublic ?? undefined,
                spfInclude: d.spfInclude ?? undefined,
              });
              return (
                <li key={d.publicId} className="border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{d.domain}</div>
                      <div className="text-muted-foreground text-sm">
                        {domainStatusLabel(d.status)}
                        {d.lastError ? ` · ${d.lastError}` : ""}
                      </div>
                    </div>
                    {canSend ? <VerifyDomainButton publicId={d.publicId} /> : null}
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
          </ul>
        </SectionCard>
      </SettingsPage>
    </PageShell>
  );
}
