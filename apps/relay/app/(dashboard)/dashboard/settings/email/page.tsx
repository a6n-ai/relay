import Link from "next/link";
import { Badge } from "@foundry/ui/badge";
import { PageShell } from "@foundry/design-system";
import { SettingsBody, SettingsPage, SettingsRow, SettingsSection } from "@/components/ds/settings";
import { SmtpSettingsForm } from "@/app/(dashboard)/dashboard/sending/smtp-form";
import { loadEmailChannelSnapshot } from "@/lib/email/load-snapshot";
import { operatorEmailPrereqs, prereqSummary } from "@/lib/email/prerequisites";
import { loadOperatorSmtpRow } from "@/lib/email/from-address";
import { EmailEventsSection } from "./email-events-section";
import { sendingDomainsService } from "@/lib/services/sending.service";
import { ViewHeader } from "@/components/ds/view-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Email sending" };

export default async function EmailSettingsPage() {
  const [row, { items: domains }] = await Promise.all([
    loadOperatorSmtpRow(),
    sendingDomainsService.list(undefined, { page: 0, size: 200 }),
  ]);
  const verifiedCount = domains.filter((d) => d.status === "verified").length;
  const snap = await loadEmailChannelSnapshot(verifiedCount, row?.host ?? null);
  const prereqs = operatorEmailPrereqs(snap);
  const envTransport = process.env.EMAIL_TRANSPORT ?? process.env.EMAIL_PROVIDER ?? "ses";

  const sendingMethod = envTransport === "ses" ? "Amazon email" : envTransport === "smtp" ? "Mail server" : envTransport;

  return (
    <PageShell>
      <ViewHeader title="Email sending" section="settings" />
      <SettingsPage
        title="Email sending"
        subtitle="How Relay delivers mail, and the From we use if an app isn’t ready yet."
      >
        <SettingsSection
          title="Before you send"
          description={`${prereqSummary(prereqs)}. Inbox providers expect a proven domain and a working From.`}
        >
          {prereqs.map((p) => (
            <SettingsRow key={p.id} label={p.label} description={p.detail}>
              <Badge variant={p.status === "ready" ? "secondary" : "destructive"}>
                {p.status === "ready" ? "Ready" : "Needed"}
              </Badge>
            </SettingsRow>
          ))}
          <SettingsRow label="Sending method" description={snap.smtpHost ? `Host ${snap.smtpHost}` : "How mail leaves Relay."}>
            <span className="text-sm text-muted-foreground">{sendingMethod}</span>
          </SettingsRow>
        </SettingsSection>
        <SettingsSection
          title="Mail server and default From"
          description="Used when an app’s From isn’t ready. This is not an app access key."
        >
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
        </SettingsSection>
        <SettingsSection
          title="Domains"
          description={domains.length === 0 ? "No domains yet. Add and check DNS on each app." : `${verifiedCount} of ${domains.length} ready. Add and check DNS on each app.`}
        >
          <SettingsRow label="Sending domains" description="Each app proves its own domain.">
            <Link className="inline-flex min-h-11 items-center text-sm underline underline-offset-2 md:min-h-0" href="/dashboard/tenants" prefetch={false}>
              Open apps
            </Link>
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="Email events" description="Which delivery events each sending stream reports, and where they go.">
          <SettingsBody>
            <EmailEventsSection />
          </SettingsBody>
        </SettingsSection>
      </SettingsPage>
    </PageShell>
  );
}
