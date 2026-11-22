"use server";

import { revalidatePath } from "next/cache";
import { sesEventSettings, type EmailEventType } from "@relay/email";
import { requirePlatformAdmin } from "@/lib/auth/org-scope";
import { parseEmailStreams, parseRoutingInput } from "@/lib/email/streams";

export async function saveStreamRouting(
  streamId: string,
  routing: { webhook: EmailEventType[]; counts?: EmailEventType[] },
): Promise<{ error?: string }> {
  try {
    await requirePlatformAdmin();
  } catch {
    return { error: "Only Relay platform admins can change event routing." };
  }
  const valid = parseRoutingInput(routing);
  if (!valid) return { error: "Invalid routing" };
  const stream = parseEmailStreams().find((s) => s.id === streamId);
  if (!stream) return { error: "Unknown stream" };
  try {
    await sesEventSettings().setRouting(stream, valid);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save routing" };
  }
  revalidatePath("/dashboard/settings/email");
  return {};
}
