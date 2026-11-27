import { createFileRoute } from "@tanstack/react-router";
import { CampaignEditor } from "../../components/campaigns/campaign-editor";
import { CampaignReport } from "../../components/campaigns/campaign-report";
import { PageDenied } from "../../components/page/page-denied";
import { orMissing } from "../../components/lib/scoped-load";
import { PageHeader } from "../../components/shell/page-header";
import { StatusBadge } from "../../components/page/status-badge";
import { fetchAudienceHook } from "../../console/apps.fns";
import { fetchCampaign, fetchCampaignOptions, fetchCampaignStats } from "../../console/campaigns.fns";
import { DetailSkeleton } from "../../components/page/page-skeleton";
import { appName } from "../../shared/scope";
import { str } from "../../components/lib/route-search";

type CampaignSearch = { appId?: string };

export const Route = createFileRoute("/_app/campaigns_/$campaignId")({
  validateSearch: (search: Record<string, unknown>): CampaignSearch => ({
    appId: str(search.appId),
  }),
  loader: async ({ params }) => {
    const campaign = await orMissing(fetchCampaign({ data: { id: params.campaignId } }));
    if (!campaign) return null;
    if ("missing" in campaign) return campaign;
    if (campaign.status !== "draft") {
      const stats = await fetchCampaignStats({ data: { id: params.campaignId } });
      if (!stats) return null;
      return { campaign, stats };
    }
    const [options, hook] = await Promise.all([
      fetchCampaignOptions({ data: { appId: campaign.appId } }),
      fetchAudienceHook({ data: { appId: campaign.appId } }),
    ]);
    if (!options) return null;
    return { campaign, options, hookReady: hook?.enabled === true };
  },
  pendingComponent: () => <DetailSkeleton crumbs={[{ label: "Campaigns", to: "/campaigns" }, { label: "Campaign" }]} />,
  component: CampaignPage,
});

function CampaignPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const { shell } = Route.useRouteContext();
  if (!page) {
    return <PageDenied crumbs={[{ label: "Campaigns", to: "/campaigns", search: { appId: search.appId } }, { label: "Campaign" }]} />;
  }
  if ("missing" in page) {
    return <PageDenied crumbs={[{ label: "Campaigns", to: "/campaigns", search: { appId: search.appId } }, { label: "Campaign" }]} reason="not-found" label="Campaign not found" />;
  }
  const { campaign } = page;
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Campaigns", to: "/campaigns", search: { appId: search.appId } }, { label: campaign.name }]}
        badge={<StatusBadge status={campaign.status} />}
      />
      {page.stats ? (
        <CampaignReport campaign={campaign} stats={page.stats} />
      ) : (
        <CampaignEditor
          campaign={campaign}
          options={page.options}
          hookReady={page.hookReady}
          appName={appName(shell.apps, campaign.appId, "—")}
        />
      )}
    </>
  );
}
