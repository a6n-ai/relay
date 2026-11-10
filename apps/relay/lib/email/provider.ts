import { type EmailAddress, type EmailMessage, type EmailProvider, createEmailProviderFromEnv, emailTransportKind } from "@relay/email";
import { createSmtpProviderFromEnv } from "@relay/email/smtp";
import { createLogger } from "@foundry/commons/logger";
import { applySmtpRowToEnv } from "./smtp-env";

let cached: EmailProvider | undefined;
// SMTP_HOST from the real env (dev, Docker) wins; otherwise the operator's saved row does.
const smtpFromEnv = Boolean(process.env.SMTP_HOST);
let hydratedKey: string | null = null;
const log = createLogger("relay-email");

function recipientsOf(to: EmailMessage["to"]): string {
  const arr: EmailAddress[] = Array.isArray(to) ? to : [to];
  return arr.map((a) => a.email).join(", ");
}

export function resetEmailProvider(): void {
  cached = undefined;
}

/** Re-reads the saved SMTP row on every drain/send, so a save in one Workers isolate reaches the others. */
export async function hydrateSmtpFromDb(): Promise<void> {
  if (smtpFromEnv) return;
  try {
    const { db } = await import("@/db/client");
    const { emailSmtpSettings } = await import("@/db/schema");
    const [row] = await db.select().from(emailSmtpSettings).limit(1);
    // shortcut: a deleted row leaves the last SMTP settings applied; clear them if deletion ever ships.
    if (!row) return;
    const key = `${row.id}:${row.updatedAt}`;
    if (key === hydratedKey) return;
    hydratedKey = key;
    applySmtpRowToEnv(row);
    resetEmailProvider();
  } catch (err) {
    log.warn({ err }, "smtp settings hydrate skipped");
  }
}

export function getEmailProvider(): EmailProvider {
  if (!cached) {
    const opts = {
      defaultFrom: {
        email: process.env.NOTIFY_FROM_EMAIL ?? "noreply@localhost",
        name: process.env.NOTIFY_FROM_NAME ?? "Relay",
      },
    };
    const inner =
      emailTransportKind(process.env) === "smtp"
        ? createSmtpProviderFromEnv(process.env, opts)
        : createEmailProviderFromEnv(process.env, opts);
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
