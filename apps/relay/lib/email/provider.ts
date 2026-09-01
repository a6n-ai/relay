import { type EmailAddress, type EmailMessage, type EmailProvider, createEmailProviderFromEnv } from "@relay/email";
import { createLogger } from "@foundry/commons/logger";
import { applySmtpRowToEnv } from "./smtp-env";

let cached: EmailProvider | undefined;
let smtpHydrated = false;
const log = createLogger("relay-email");

function recipientsOf(to: EmailMessage["to"]): string {
  const arr: EmailAddress[] = Array.isArray(to) ? to : [to];
  return arr.map((a) => a.email).join(", ");
}

export function resetEmailProvider(): void {
  cached = undefined;
}

export async function hydrateSmtpFromDb(): Promise<void> {
  if (smtpHydrated) return;
  smtpHydrated = true;
  if (process.env.SMTP_HOST) return;
  try {
    const { db } = await import("@/db/client");
    const { emailSmtpSettings } = await import("@/db/schema");
    const [row] = await db.select().from(emailSmtpSettings).limit(1);
    if (row) applySmtpRowToEnv(row);
  } catch (err) {
    log.warn({ err }, "smtp settings hydrate skipped");
  }
}

export function getEmailProvider(): EmailProvider {
  if (!cached) {
    const inner = createEmailProviderFromEnv(process.env, {
      defaultFrom: {
        email: process.env.NOTIFY_FROM_EMAIL ?? "noreply@localhost",
        name: process.env.NOTIFY_FROM_NAME ?? "Relay",
      },
    });
    cached = {
      name: inner.name,
      async send(message) {
        try {
          const result = await inner.send(message);
          log.debug({ to: recipientsOf(message.to), id: result.providerMessageId }, "sent");
          return result;
        } catch (err) {
          log.error({ err, to: recipientsOf(message.to) }, "send failed");
          throw err;
        }
      },
    };
  }
  return cached;
}
