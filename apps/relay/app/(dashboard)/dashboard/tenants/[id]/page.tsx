import { notFound } from "next/navigation";
import { eq } from "@foundry/commons";
import { KeyIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { buildSendingDomainRecords } from "@relay/email";
import { AddDomainForm, VerifyDomainButton } from "@/app/(dashboard)/dashboard/domains/domain-forms";
import { displayChannel, domainStatusLabel, fromSourceLabel } from "@/components/ds/plain-labels";
import { OperatorSplit } from "@/components/ds/operator-split";
import { loadEmailChannelSnapshot } from "@/lib/email/load-snapshot";
import { emailChannelReady, operatorEmailPrereqs } from "@/lib/email/prerequisites";
import { resolveTenantEmailFrom } from "@/lib/email/from-address";
import { emailSendersService } from "@/lib/services/email-senders.service";
import { sendingDomainsService } from "@/lib/services/sending.service";
import { apiKeysService, tenantsService } from "@/lib/services/tenants.service";
import { countTenantSendsThisMonth } from "@/lib/tenants/usage";
import { AddSenderForm, IssueKeyForm, UpdateQuotaForm } from "../tenant-ops-forms";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await tenantsService.read(id).catch(() => null);
  if (!tenant) notFound();

  const [{ items: keys }, senders, { items: domains }, used, from] = await Promise.all([
    apiKeysService.list(eq("tenantId", tenant.id), { page: 0, size: 50 }),
    emailSendersService.forTenant(tenant.id),
    sendingDomainsService.list(eq("tenantId", tenant.id), { page: 0, size: 50 }),
    countTenantSendsThisMonth(tenant.id),
    resolveTenantEmailFrom(tenant.id),
  ]);
  const verifiedCount = domains.filter((d) => d.status === "verified").length;
  const prereqs = operatorEmailPrereqs(await loadEmailChannelSnapshot(verifiedCount));
  const emailReady = emailChannelReady(prereqs) && verifiedCount > 0;

  return (
    <PageShell>
      <PageHeader
        icon={KeyIcon}
        title={tenant.name}
        subtitle={`${tenant.slug} · monthly send limit for this app. From addresses work after you prove the domain.`}
      />
      <OperatorSplit
        create={
          <div className="flex flex-col gap-6">
      <SectionCard title="Monthly send limit" subtitle="0 means no cap. Counts messages started this calendar month (UTC).">
        <p className="mb-3 text-sm">Sent {used} of {tenant.monthlyMessageQuota === 0 ? "unlimited" : tenant.monthlyMessageQuota}</p>
        <UpdateQuotaForm publicId={tenant.publicId} quota={tenant.monthlyMessageQuota} />
      </SectionCard>
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
        <div className="mt-4">
          <IssueKeyForm publicId={tenant.publicId} />
        </div>
      </SectionCard>
          </div>
        }
        list={
          <div className="flex flex-col gap-6">
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
          Who mail is from: {from ? `${from.email} (${fromSourceLabel(from.source)})` : "none. Set a default From or prove a sender"}
          {emailReady ? "" : " · Email isn’t fully ready"}
        </p>
      </SectionCard>
      <SectionCard title="Your domain" subtitle="Add the records at your domain host, then tap Check DNS.">
        <AddDomainForm slugs={[tenant.slug]} lockedSlug={tenant.slug} />
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
        </ul>
      </SectionCard>
      <SectionCard
        title="From addresses"
        subtitle="Example: info@tiffingrab.ca. Ready only after tiffingrab.ca DNS is checked. Otherwise Relay uses the default From."
      >
        <AddSenderForm publicId={tenant.publicId} />
        <ul className="mt-4 space-y-2 text-sm">
          {senders.map((s) => (
            <li key={s.publicId} className="flex flex-wrap items-center gap-2">
              <span>{s.displayName ? `${s.displayName} <${s.email}>` : s.email}</span>
              {s.verifiedAt ? (
                <Badge variant="secondary">Verified</Badge>
              ) : (
                <Badge variant="destructive">Not ready · using default From</Badge>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>
          </div>
        }
      />
    </PageShell>
  );
}
