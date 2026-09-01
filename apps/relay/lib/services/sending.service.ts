import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { emailSmtpSettings, sendingDomains } from "@/db/schema";
import { SessionUpdatableService } from "./session-service";

class SendingDomainsService extends SessionUpdatableService<typeof sendingDomains> {
  protected redactChanges(
    changes: Record<string, { from: unknown; to: unknown }> | null,
  ): Record<string, { from: unknown; to: unknown }> | null {
    if (!changes) return null;
    const next = { ...changes };
    if (next.dkimPrivate) next.dkimPrivate = { from: "***", to: "***" };
    if (next.verifyToken) next.verifyToken = { from: "***", to: "***" };
    return next;
  }
}

class SmtpSettingsService extends SessionUpdatableService<typeof emailSmtpSettings> {
  protected redactChanges(
    changes: Record<string, { from: unknown; to: unknown }> | null,
  ): Record<string, { from: unknown; to: unknown }> | null {
    if (!changes) return null;
    const next = { ...changes };
    if (next.password) next.password = { from: "***", to: "***" };
    return next;
  }
}

export const sendingDomainsService = new SendingDomainsService(
  new UpdatableRepository(db, sendingDomains, sendingDomains.publicId, sendingDomains.id),
);

export const smtpSettingsService = new SmtpSettingsService(
  new UpdatableRepository(db, emailSmtpSettings, emailSmtpSettings.publicId, emailSmtpSettings.id),
);
