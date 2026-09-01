import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { emailSmtpSettings, sendingDomains } from "@/db/schema";
import { redactFields } from "@/lib/audit/redact";
import { SessionUpdatableService } from "./session-service";

class SendingDomainsService extends SessionUpdatableService<typeof sendingDomains> {
  protected redactChanges(
    changes: Record<string, { from: unknown; to: unknown }> | null,
  ): Record<string, { from: unknown; to: unknown }> | null {
    return redactFields(changes, ["dkimPrivate", "verifyToken"]);
  }
}

class SmtpSettingsService extends SessionUpdatableService<typeof emailSmtpSettings> {
  protected redactChanges(
    changes: Record<string, { from: unknown; to: unknown }> | null,
  ): Record<string, { from: unknown; to: unknown }> | null {
    return redactFields(changes, ["password"]);
  }
}

export const sendingDomainsService = new SendingDomainsService(
  new UpdatableRepository(db, sendingDomains, sendingDomains.publicId, sendingDomains.id),
);

export const smtpSettingsService = new SmtpSettingsService(
  new UpdatableRepository(db, emailSmtpSettings, emailSmtpSettings.publicId, emailSmtpSettings.id),
);
