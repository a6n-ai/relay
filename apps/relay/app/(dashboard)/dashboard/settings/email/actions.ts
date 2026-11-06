"use server";

import { revalidatePath } from "next/cache";
import { sesEventSettings, type EmailEventType } from "@relay/email";
import { requirePermission } from "@/lib/auth/guards";
import { parseEmailStreams } from "@/lib/email/streams";

export async function saveStreamRouting(
  streamId: string,
  routing: { webhook: EmailEventType[]; counts?: EmailEventType[] },
): Promise<{ error?: string }> {
  await requirePermission({ sending: ["write"] });
  const stream = parseEmailStreams().find((s) => s.id === streamId);
  if (!stream) return { error: "Unknown stream" };
  try {
    await sesEventSettings().setRouting(stream, routing);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save routing" };
  }
  revalidatePath("/dashboard/settings/email");
  return {};
}
