import { smtpSettingsService } from "@/lib/services/sending.service";
import type { EmailChannelSnapshot } from "./prerequisites";
import { operatorDefaultFrom } from "./from-address";

export async function loadEmailChannelSnapshot(verifiedDomainCount: number): Promise<EmailChannelSnapshot> {
  const page = await smtpSettingsService.list(undefined, { page: 0, size: 1 });
  const row = page.items[0];
  const smtpHost = row?.host || process.env.SMTP_HOST || null;
  const envTransport = (process.env.EMAIL_TRANSPORT ?? process.env.EMAIL_PROVIDER ?? "ses").toLowerCase();
  let transport: EmailChannelSnapshot["transport"] = "none";
  if (smtpHost) transport = "smtp";
  else if (envTransport === "ses") transport = "ses";
  const from = await operatorDefaultFrom();
  return {
    transport,
    fromEmail: from?.email ?? null,
    fromName: from?.name ?? null,
    smtpHost,
    bounceWebhookPath: "/api/webhooks/ses",
    verifiedDomainCount,
  };
}
