import { toast } from "@foundry/ui/toast";
import type { CampaignAttachment } from "./campaign-attachments";

export interface CampaignContentPayload {
  channel: string;
  locale: string;
  subject: string;
  body: unknown;
  html?: string;
  preheader?: string;
  attachments?: CampaignAttachment[];
  providerTemplateId?: string;
  revision: number;
}

/** The one save for campaign content; throws after toasting on failure, so a caller never reports a save that did not happen. */
export async function saveCampaignContent(
  campaignPublicId: string,
  { attachments, ...rest }: CampaignContentPayload,
): Promise<"conflict" | { revision: number }> {
  const res = await fetch(`/api/notifications/campaigns/${campaignPublicId}/content`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...rest, attachments: attachments?.length ? attachments : undefined }),
  });
  if (res.status === 409) return "conflict";
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // One id: autosave retries the same failure, which would otherwise stack identical toasts.
    toast.error(data.detail ?? data.title ?? "Save failed", { id: `campaign-content-${campaignPublicId}` });
    throw new Error("save failed");
  }
  if (data.removed?.length) toast.warning(`Removed ${data.removed.length} unsafe item(s): ${data.removed.join(", ")}`);
  return { revision: data.revision };
}
