import { eq as foundryEq } from "@foundry/commons";
import { and, eq, inArray, sql } from "drizzle-orm";
import { enqueueTenant, resolveAudience, type AudienceDef, type Channel } from "@relay/engine";
import { db } from "@/db/client";
import { campaignTables, notificationTables } from "@/db/schema";
import { campaignTenantsService } from "@/lib/services/campaign-tenants.service";
import { campaignsService } from "@/lib/services/campaigns.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { operatorCampaignDeps } from "./deps";

const BATCH = 500;

/**
 * Expand a campaign into tenant outbox rows. Engine materializeCampaign uses
 * enqueue() against a users FK — Relay recipients are list addresses and the
 * outbox requires tenant_id.
 */
export async function materializeTenantCampaign(
  campaignPublicId: string,
): Promise<{ queued: number }> {
  const { campaign } = campaignTables;
  const deps = operatorCampaignDeps();

  const campPage = await campaignsService.list(foundryEq("publicId", campaignPublicId), {
    page: 0,
    size: 1,
  });
  const camp = campPage.items[0];
  if (!camp) return { queued: 0 };

  const binding = await campaignTenantsService.forCampaignId(camp.id);
  if (!binding) return { queued: 0 };
  const tenant = await tenantsService.findById(binding.tenantId);
  if (!tenant) return { queued: 0 };

  const claimed = await db
    .update(campaign)
    .set({ status: "sending" })
    .where(
      and(
        eq(campaign.publicId, campaignPublicId),
        inArray(campaign.status, ["draft", "scheduled", "sending"]),
      ),
    )
    .returning({
      id: campaign.id,
      audience: campaign.audience,
      channels: campaign.channels,
    });

  const row = claimed[0];
  if (!row) return { queued: 0 };

  const recipients = await resolveAudience(
    {
      ...deps,
      mailingCountry: tenant.mailingCountry,
    },
    row.audience as AudienceDef,
  );

  let queued = 0;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const slice = recipients.slice(i, i + BATCH);
    await db.transaction(async (tx) => {
      for (const r of slice) {
        await enqueueTenant(tx, notificationTables, {
          tenantId: binding.tenantId,
          recipientEmail: r.email,
          recipientPhone: r.phone,
          title: "",
          body: "",
          kind: "marketing",
          campaignId: row.id as bigint,
          channels: row.channels as Channel[],
          data: { contact: { name: r.name ?? "", ...(r.vars ?? {}) } },
          dedupeKey: `cmp:${campaignPublicId}:${(r.email ?? r.phone ?? "").toLowerCase()}`,
        });
        queued += 1;
      }
    });
  }

  await db
    .update(campaign)
    .set({
      status: "sent",
      sentAt: Date.now(),
      counts: sql`${campaign.counts} || ${JSON.stringify({ queued })}::jsonb`,
    })
    .where(eq(campaign.id, row.id));

  return { queued };
}
