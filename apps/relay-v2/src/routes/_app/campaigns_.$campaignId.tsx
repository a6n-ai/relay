import { createFileRoute, Link } from "@tanstack/react-router";
import { CampaignEditor } from "../../components/campaign-editor";
import { CampaignReport } from "../../components/campaign-report";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { isNotFound } from "../../components/error-text";
import { ViewHeader } from "../../components/view-header";
import {
  fetchCampaign,
  fetchCampaignOptions,
  fetchCampaignStats,
  previewAudienceFn,
} from "../../console/campaigns.fns";

type CampaignSearch = { appId?: string };

export const Route = createFileRoute("/_app/campaigns_/$campaignId")({
  validateSearch: (search: Record<string, unknown>): CampaignSearch => ({
    appId: typeof search.appId === "string" && search.appId ? search.appId : undefined,
  }),
  loader: async ({ params }) => {
    const campaign = await fetchCampaign({ data: { id: params.campaignId } }).catch((err) => {
      if (isNotFound(err)) return { missing: true as const };
      throw err;
    });
    if (!campaign) return null;
    if ("missing" in campaign) return campaign;
    if (campaign.status !== "draft") {
      const [stats, audience] = await Promise.all([
        fetchCampaignStats({ data: { id: params.campaignId } }),
        previewAudienceFn({ data: { id: params.campaignId } }),
      ]);
      if (!stats || !audience) return null;
      return { campaign, stats, audience };
    }
    const options = await fetchCampaignOptions({ data: { appId: campaign.appId } });
    if (!options) return null;
    return { campaign, options };
  },
  component: CampaignPage,
});

function CampaignPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const { shell } = Route.useRouteContext();
  if (!page) {
    return (
      <>
        <ViewHeader title="Campaign" />
        <DeniedState reason={deniedReason(shell)} />
      </>
    );
  }
  if ("missing" in page) {
    return (
      <>
        <ViewHeader title="Campaign" />
        <DeniedState reason="not-found" label="Campaign not found" />
      </>
    );
  }
  const { campaign } = page;
  return (
    <>
      <ViewHeader
        title={campaign.name}
        actions={
          <Link to="/campaigns" search={{ appId: search.appId }} className="text-sm hover:underline">
            All campaigns
          </Link>
        }
      />
      <div className="p-4">
        {page.stats ? (
          <CampaignReport campaign={campaign} stats={page.stats} audience={page.audience} />
        ) : (
          <CampaignEditor campaign={campaign} options={page.options} />
        )}
      </div>
    </>
  );
}
