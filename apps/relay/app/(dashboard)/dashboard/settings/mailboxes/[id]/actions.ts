"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { mailboxScope } from "@/lib/mailbox/scope";
import { tenantMailboxesService } from "@/lib/services/tenant-mailboxes.service";

export async function updateMailboxSendingAction(formData: FormData): Promise<{ error?: string }> {
  await requirePermission({ tenant: ["write"] });
  const publicId = String(formData.get("publicId") ?? "");
  const scope = await mailboxScope();
  const row = await tenantMailboxesService.read(publicId).catch(() => null);
  if (!row || !scope.tenantIds.includes(row.tenantId)) return { error: "Unknown mailbox" };
  const displayName = String(formData.get("displayName") ?? "").trim();
  const result = await tenantMailboxesService.updateSending(publicId, {
    canSend: formData.get("canSend") === "on",
    displayName: displayName || null,
  });
  if ("error" in result) return { error: result.error };
  revalidatePath("/dashboard/settings/mailboxes");
  revalidatePath(`/dashboard/settings/mailboxes/${publicId}`);
  return {};
}
