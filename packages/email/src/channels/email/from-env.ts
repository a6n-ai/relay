import { SesEmailProvider } from "./ses-provider";
import { AppError } from "@foundry/commons";
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

/** SES only; SMTP lives behind @relay/email/smtp so nodemailer's SMTP transport stays out of edge bundles. */
export function createEmailProviderFromEnv(
  env: EmailEnv = process.env,
  opts?: { defaultFrom?: EmailAddress },
): EmailProvider {
  if (emailTransportKind(env) === "smtp") {
    throw new AppError("EMAIL_TRANSPORT=smtp: import createSmtpProviderFromEnv from @relay/email/smtp", 500);
  }
  return new SesEmailProvider({
    defaultFrom: opts?.defaultFrom ?? defaultFromAddress(env),
    region: env.AWS_REGION,
    configurationSetName: env.SES_CONFIGURATION_SET,
  });
}
