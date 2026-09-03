import { notFound } from "next/navigation";
import { MegaphoneIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { CampaignSendButton } from "@relay/engine/ui";
import { countAudience, type AudienceDef } from "@relay/engine";
import { operatorCampaignDeps } from "@/lib/campaigns/deps";
import { OperatorSplit } from "@/components/ds/operator-split";
import { campaignContentService, campaignsService } from "@/lib/services/campaigns.service";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let row;
  try {
    row = await campaignsService.read(id);
  } catch {
    notFound();
  }
  const [tenant, content] = await Promise.all([
    campaignsService.tenantForCampaign(row.id),
    campaignContentService.forCampaignId(row.id),
  ]);
  const count = await countAudience(
    { ...operatorCampaignDeps(), mailingCountry: tenant?.mailingCountry ?? "CA" },
    row.audience as AudienceDef,
  );
  const canSend = row.status === "draft" || row.status === "scheduled";

  return (
    <PageShell>
      <PageHeader
        icon={MegaphoneIcon}
        title={row.name}
        subtitle={tenant ? `Sends as ${tenant.name}` : "Choose an app before sending"}
        actions={
          canSend ? <CampaignSendButton campaignPublicId={row.publicId} count={count} /> : (
            <Badge variant="secondary">{row.status}</Badge>
          )
        }
      />
      <OperatorSplit
        create={
          <SectionCard title="Who receives this">
            <p className="text-sm">{count} people who can receive this, after unsubscribes.</p>
            {!tenant?.physicalAddress && canSend ? (
              <p className="text-destructive mt-2 text-sm">
                This app has no street address. Marketing mail needs one in the footer. Add it on the app.
              </p>
            ) : null}
          </SectionCard>
        }
        list={
          content ? (
            <SectionCard title={content.subject} subtitle="Email copy">
              <pre className="whitespace-pre-wrap text-sm">{content.text}</pre>
            </SectionCard>
          ) : (
            <p className="text-muted-foreground text-sm">No email content saved.</p>
          )
        }
      />
    </PageShell>
  );
}
