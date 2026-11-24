import { createFileRoute, Link } from "@tanstack/react-router";
import { CampaignEditor } from "../../components/campaign-editor";
import { DeniedState, deniedReason } from "../../components/denied-state";
import { isNotFound } from "../../components/error-text";
import { StatusBadge } from "../../components/status-badge";
import { ViewHeader } from "../../components/view-header";
import { fetchCampaign, fetchCampaignOptions } from "../../console/campaigns.fns";

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
  const { campaign, options } = page;
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
        {campaign.status === "draft" ? (
          <CampaignEditor campaign={campaign} options={options} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={campaign.status} />
            <span className="text-sm text-muted-foreground">This campaign has left draft, so it can no longer be edited.</span>
          </div>
        )}
      </div>
    </>
  );
}
