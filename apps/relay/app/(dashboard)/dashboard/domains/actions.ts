"use server";

import { promises as dns } from "node:dns";
import { revalidatePath } from "next/cache";
import {
  generateDkimKeyPair,
  generateDomainVerifyToken,
  verifySendingDomainOwnership,
} from "@relay/email";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { emailSmtpSettings } from "@/db/schema";
import { parseAddSendingDomainForm } from "@/lib/email/domain-form";
import { sendingDomainsService } from "@/lib/services/sending.service";
import { tenantsService } from "@/lib/services/tenants.service";

export async function addSendingDomainAction(formData: FormData): Promise<{ error?: string }> {
  await requirePermission({ sending: ["write"] });
  const parsed = parseAddSendingDomainForm(formData);
  if ("error" in parsed) return parsed;
  const { slug, domain } = parsed.value;

  const tenant = await tenantsService.findBySlug(slug);
  if (!tenant) return { error: "Unknown tenant" };

  const [smtp] = await db.select().from(emailSmtpSettings).limit(1);
  const keys = generateDkimKeyPair();
  try {
    await sendingDomainsService.create({
      tenantId: tenant.id,
      domain,
      verifyToken: generateDomainVerifyToken(),
      dkimSelector: "relay",
      dkimPublic: keys.dkimP,
      dkimPrivate: keys.privateKeyPem,
      spfInclude: smtp?.spfInclude ?? process.env.SMTP_SPF_INCLUDE ?? process.env.SES_SPF_INCLUDE ?? "amazonses.com",
    });
  } catch {
    return { error: "Could not add domain (it may already exist for this tenant)" };
  }
  revalidatePath("/dashboard/domains");
  return {};
}

export async function verifySendingDomainAction(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  await requirePermission({ sending: ["write"] });
  const publicId = String(formData.get("publicId") ?? "");
  const row = await sendingDomainsService.read(publicId).catch(() => null);
  if (!row) return { error: "Unknown domain" };

  const ok = await verifySendingDomainOwnership(row.domain, row.verifyToken, (h) => dns.resolveTxt(h));
  await sendingDomainsService.update(publicId, {
    status: ok ? "verified" : "pending",
    verifiedAt: ok ? Date.now() : null,
    lastCheckedAt: Date.now(),
    lastError: ok ? null : "Ownership TXT not found yet",
  });
  revalidatePath("/dashboard/domains");
  return ok ? { ok: true } : { error: "TXT record not found yet. DNS can take a few minutes." };
}
