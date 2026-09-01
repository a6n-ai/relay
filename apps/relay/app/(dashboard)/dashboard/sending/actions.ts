"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { emailSmtpSettings } from "@/db/schema";
import { resetEmailProvider } from "@/lib/email/provider";
import { applySmtpRowToEnv } from "@/lib/email/smtp-env";
import { smtpSettingsService } from "@/lib/services/sending.service";

export async function saveSmtpSettingsAction(formData: FormData): Promise<{ error?: string }> {
  await requirePermission({ sending: ["write"] });
  const host = String(formData.get("host") ?? "").trim();
  const port = Number(formData.get("port") ?? "587");
  const username = String(formData.get("username") ?? "").trim() || null;
  const passwordIn = String(formData.get("password") ?? "");
  const spfInclude = String(formData.get("spfInclude") ?? "").trim() || null;
  const secure = String(formData.get("secure") ?? "") === "on" || String(formData.get("secure") ?? "") === "true";
  if (!host) return { error: "SMTP host is required" };

  const [existing] = await db.select().from(emailSmtpSettings).limit(1);
  const password = passwordIn || existing?.password || null;
  const row = {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    username,
    password,
    spfInclude,
  };
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
