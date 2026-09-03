import { cache } from "react";
import { smtpSettingsService } from "@/lib/services/sending.service";
import { emailSendersService } from "@/lib/services/email-senders.service";

export type ResolvedFrom = { email: string; name?: string; source: "tenant" | "operator" };

export const loadOperatorSmtpRow = cache(async () => {
  const page = await smtpSettingsService.list(undefined, { page: 0, size: 1 });
  return page.items[0] ?? null;
});

export async function operatorDefaultFrom(): Promise<{ email: string; name?: string } | null> {
  const row = await loadOperatorSmtpRow();
  const email = row?.fromEmail?.trim() || process.env.NOTIFY_FROM_EMAIL || null;
  if (!email) return null;
  const name = row?.fromName?.trim() || process.env.NOTIFY_FROM_NAME || undefined;
  return { email, name };
}

export async function resolveTenantEmailFrom(tenantId: bigint): Promise<ResolvedFrom | null> {
  const verified = await emailSendersService.verifiedForTenant(tenantId);
  const first = verified[0];
  if (first) {
    return {
      email: first.email,
      name: first.displayName ?? undefined,
      source: "tenant",
    };
  }
  const op = await operatorDefaultFrom();
  if (!op) return null;
  return { ...op, source: "operator" };
}
