import { SesEmailProvider } from "./ses-provider";
import { SmtpEmailProvider, type SmtpProviderConfig } from "./smtp-provider";
import type { EmailAddress } from "./types";
import type { EmailProvider } from "./provider";

export type EmailTransportKind = "ses" | "smtp";

export type EmailEnv = Record<string, string | undefined>;

export function emailTransportKind(env: EmailEnv = process.env): EmailTransportKind {
  const raw = (env.EMAIL_TRANSPORT ?? env.EMAIL_PROVIDER ?? "ses").trim().toLowerCase();
  return raw === "smtp" ? "smtp" : "ses";
}

export function defaultFromAddress(
  env: EmailEnv = process.env,
  fallbackEmail = "noreply@localhost",
  fallbackName = "Relay",
): EmailAddress {
  return {
    email: env.NOTIFY_FROM_EMAIL ?? fallbackEmail,
    name: env.NOTIFY_FROM_NAME ?? fallbackName,
  };
}

function smtpConfigFromEnv(env: EmailEnv, defaultFrom: EmailAddress): SmtpProviderConfig {
  const port = Number(env.SMTP_PORT ?? "587");
  const dkim =
    env.SMTP_DKIM_DOMAIN && env.SMTP_DKIM_PRIVATE_KEY
      ? {
          domainName: env.SMTP_DKIM_DOMAIN,
          keySelector: env.SMTP_DKIM_SELECTOR ?? "relay",
          privateKey: env.SMTP_DKIM_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }
      : undefined;
  return {
    defaultFrom,
    host: env.SMTP_HOST ?? "127.0.0.1",
    port: Number.isFinite(port) ? port : 587,
    secure: env.SMTP_SECURE === "true" || env.SMTP_PORT === "465",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
    dkim,
  };
}

/** SES by default; set EMAIL_TRANSPORT=smtp for a configured SMTP relay. */
export function createEmailProviderFromEnv(
  env: EmailEnv = process.env,
  opts?: { defaultFrom?: EmailAddress },
): EmailProvider {
  const defaultFrom = opts?.defaultFrom ?? defaultFromAddress(env);
  if (emailTransportKind(env) === "smtp") {
    return new SmtpEmailProvider(smtpConfigFromEnv(env, defaultFrom));
  }
  return new SesEmailProvider({
    defaultFrom,
    region: env.AWS_REGION,
    configurationSetName: env.SES_CONFIGURATION_SET,
  });
}
