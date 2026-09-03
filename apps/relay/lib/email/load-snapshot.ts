import type { EmailChannelSnapshot } from "./prerequisites";
import { operatorDefaultFrom, loadOperatorSmtpRow } from "./from-address";

export async function loadEmailChannelSnapshot(
  verifiedDomainCount: number,
  smtpHostHint?: string | null,
): Promise<EmailChannelSnapshot> {
  const [row, from] = await Promise.all([
    smtpHostHint !== undefined ? Promise.resolve(null) : loadOperatorSmtpRow(),
    operatorDefaultFrom(),
  ]);
  const smtpHost =
    smtpHostHint !== undefined
      ? smtpHostHint || process.env.SMTP_HOST || null
      : row?.host || process.env.SMTP_HOST || null;
  const envTransport = (process.env.EMAIL_TRANSPORT ?? process.env.EMAIL_PROVIDER ?? "ses").toLowerCase();
  let transport: EmailChannelSnapshot["transport"] = "none";
  if (smtpHost) transport = "smtp";
  else if (envTransport === "ses") transport = "ses";
  return {
    transport,
    fromEmail: from?.email ?? null,
    fromName: from?.name ?? null,
    smtpHost,
    bounceWebhookPath: "/api/webhooks/ses",
    verifiedDomainCount,
  };
}
