import Link from "next/link";
import { MailIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { OperatorSplit } from "@/components/ds/operator-split";
import { SmtpSettingsForm } from "@/app/(dashboard)/dashboard/sending/smtp-form";
import { loadEmailChannelSnapshot } from "@/lib/email/load-snapshot";
import { operatorEmailPrereqs } from "@/lib/email/prerequisites";
import { loadOperatorSmtpRow } from "@/lib/email/from-address";
import { sendingDomainsService } from "@/lib/services/sending.service";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const [row, { items: domains }] = await Promise.all([
    loadOperatorSmtpRow(),
    sendingDomainsService.list(undefined, { page: 0, size: 200 }),
  ]);
  const verifiedCount = domains.filter((d) => d.status === "verified").length;
  const snap = await loadEmailChannelSnapshot(verifiedCount, row?.host ?? null);
  const prereqs = operatorEmailPrereqs(snap);
  const envTransport = process.env.EMAIL_TRANSPORT ?? process.env.EMAIL_PROVIDER ?? "ses";

  return (
    <PageShell>
      <PageHeader
        icon={MailIcon}
        title="Email sending"
        subtitle="How Relay actually delivers mail, and the From we use if an app isn’t ready yet."
      />
      <OperatorSplit
        create={
          <SectionCard title="Mail server and default From" subtitle="Used when an app’s From isn’t ready. This is not an app access key.">
            <SmtpSettingsForm
              host={row?.host ?? process.env.SMTP_HOST ?? ""}
              port={row?.port ?? Number(process.env.SMTP_PORT ?? 587)}
              secure={row?.secure ?? process.env.SMTP_SECURE === "true"}
              username={row?.username ?? process.env.SMTP_USER ?? ""}
              spfInclude={row?.spfInclude ?? ""}
              fromEmail={row?.fromEmail ?? process.env.NOTIFY_FROM_EMAIL ?? ""}
              fromName={row?.fromName ?? process.env.NOTIFY_FROM_NAME ?? ""}
              hasPassword={Boolean(row?.password ?? process.env.SMTP_PASS)}
            />
          </SectionCard>
        }
        list={
          <div className="flex flex-col gap-6">
            <SectionCard title="Before you send" subtitle="Inbox providers expect a proven domain and a working From.">
              <ul className="flex flex-col gap-3 text-sm">
                {prereqs.map((p) => (
                  <li key={p.id} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={p.status === "ready" ? "secondary" : "destructive"}>
                        {p.status === "ready" ? "Ready" : "Needed"}
                      </Badge>
                      <span className="font-medium">{p.label}</span>
                    </div>
                    <p className="text-muted-foreground">{p.detail}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm">
                Sending method: {envTransport === "ses" ? "Amazon email" : envTransport === "smtp" ? "mail server" : envTransport}
                {snap.smtpHost ? ` · host ${snap.smtpHost}` : ""}
              </p>
            </SectionCard>
            <SectionCard title="Domains" subtitle={`${verifiedCount} ready of ${domains.length}. Add and check DNS on each app.`}>
              <Link className="text-sm underline underline-offset-2" href="/dashboard/tenants">
                Open apps
              </Link>
            </SectionCard>
          </div>
        }
      />
    </PageShell>
  );
}
