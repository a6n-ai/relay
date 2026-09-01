import { MailIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { db } from "@/db/client";
import { emailSmtpSettings } from "@/db/schema";
import { SmtpSettingsForm } from "./smtp-form";

export const dynamic = "force-dynamic";

export default async function SendingPage() {
  const [row] = await db.select().from(emailSmtpSettings).limit(1);
  const envTransport = process.env.EMAIL_TRANSPORT ?? process.env.EMAIL_PROVIDER ?? "ses";
  return (
    <PageShell>
      <PageHeader
        icon={MailIcon}
        title="SMTP"
        subtitle="Default transport is Amazon SES. SMTP credentials are not a tenant API key. Saves go through the UpdatableService layer and stamp updated_by from the session."
      />
      <p className="text-sm">
        Current process transport: <code>{envTransport}</code>
        {process.env.SMTP_HOST ? ` · env host ${process.env.SMTP_HOST}` : ""}
      </p>
      <SectionCard title="Relay host">
        <SmtpSettingsForm
          host={row?.host ?? process.env.SMTP_HOST ?? ""}
          port={row?.port ?? Number(process.env.SMTP_PORT ?? 587)}
          secure={row?.secure ?? process.env.SMTP_SECURE === "true"}
          username={row?.username ?? process.env.SMTP_USER ?? ""}
          spfInclude={row?.spfInclude ?? ""}
          hasPassword={Boolean(row?.password ?? process.env.SMTP_PASS)}
        />
      </SectionCard>
    </PageShell>
  );
}
