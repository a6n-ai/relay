"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { emailSmtpSettings } from "@/db/schema";
import { resetEmailProvider } from "@/lib/email/provider";
import { applySmtpRowToEnv } from "@/lib/email/smtp-env";
import { parseSmtpSettingsForm } from "@/lib/email/smtp-form";
import { smtpSettingsService } from "@/lib/services/sending.service";

export async function saveSmtpSettingsAction(formData: FormData): Promise<{ error?: string }> {
  await requirePermission({ sending: ["write"] });
  const [existing] = await db.select().from(emailSmtpSettings).limit(1);
  const parsed = parseSmtpSettingsForm(formData, existing?.password);
  if ("error" in parsed) return parsed;
  const row = parsed.value;
  if (existing) {
    await smtpSettingsService.update(existing.publicId, row);
  } else {
    await smtpSettingsService.create(row);
  }
  applySmtpRowToEnv(row);
  resetEmailProvider();
  revalidatePath("/dashboard/sending");
  return {};
}
