import { defaultFromAddress, type EmailEnv } from "./channels/email/from-env";
import type { EmailProvider } from "./channels/email/provider";
import { SmtpEmailProvider, type SmtpProviderConfig } from "./channels/email/smtp-provider";
import type { EmailAddress } from "./channels/email/types";

export * from "./channels/email/smtp-provider";

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

export function createSmtpProviderFromEnv(
  env: EmailEnv = process.env,
  opts?: { defaultFrom?: EmailAddress },
): EmailProvider {
  return new SmtpEmailProvider(smtpConfigFromEnv(env, opts?.defaultFrom ?? defaultFromAddress(env)));
}
